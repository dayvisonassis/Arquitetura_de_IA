import type { Knex } from 'knex'
import { getDb } from '../../database'
import { getRedis } from '../../redis-client'
import { getCatalog, type Catalog } from '../config/catalog'
import logger from '../logger'

export type ResourceType = 'capability' | 'deployment'

export type Suspension = {
  reason: string
  actor: string
  suspended_at: string
}

type CapabilityState = {
  state: 'active' | 'suspended'
  suspension: Suspension | null
}

type DeploymentState = {
  state: 'active' | 'suspended' | 'cooldown'
  suspension: Suspension | null
  cooldown_until: string | null
}

export type CatalogState = {
  capabilities: Record<string, CapabilityState>
  deployments: Record<string, DeploymentState>
}

type Row = {
  resource_type: ResourceType
  resource_name: string
  reason: string
  actor: string
  suspended_at: Date | string
}

type Redis = Awaited<ReturnType<typeof getRedis>>

type Progress = {
  expired: boolean
  commitSent: boolean
  undo: Array<() => Promise<unknown>>
}

export const STATE_TIMEOUT_MS = 2000

const TABLE = 'catalog_suspensions'
const SUSPENSIONS_KEY = 'catalog:suspensions'
const LOADED_FIELD = '_loaded'
const COOLDOWN_PREFIX = 'catalog:cooldown:'

export class CatalogStateUnavailableError extends Error {
  readonly unconfirmed: boolean

  constructor(unconfirmed = false) {
    super(
      unconfirmed
        ? 'Catalog state change could not be confirmed'
        : 'Catalog state is unavailable'
    )
    this.name = 'CatalogStateUnavailableError'
    this.unconfirmed = unconfirmed
  }
}

export class CatalogInvalidStateError extends Error {
  readonly type: ResourceType
  readonly resource: string
  readonly suspended: boolean

  constructor(type: ResourceType, resource: string, suspended: boolean) {
    super(`${type} '${resource}' is ${suspended ? 'already' : 'not'} suspended`)
    this.name = 'CatalogInvalidStateError'
    this.type = type
    this.resource = resource
    this.suspended = suspended
  }
}

const fieldOf = (type: ResourceType, name: string): string => `${type}:${name}`

const toSuspension = (row: Row): Suspension => ({
  reason: row.reason,
  actor: row.actor,
  suspended_at: new Date(row.suspended_at).toISOString()
})

const parseSuspension = (value: string | undefined): Suspension | null =>
  value ? (JSON.parse(value) as Suspension) : null

const isDuplicateKey = (error: unknown): boolean =>
  (error as { code?: string } | null)?.code === 'ER_DUP_ENTRY'

const rollback = (trx: Knex.Transaction): Promise<unknown> =>
  trx.isCompleted() ? Promise.resolve() : trx.rollback()

const loadReplica = async (redis: Redis): Promise<Record<string, string>> => {
  const replica = await redis.hGetAll(SUSPENSIONS_KEY)
  if (replica[LOADED_FIELD]) {
    return replica
  }
  const rows: Row[] = await getDb({ operation: 'read' })<Row>(TABLE).select(
    'resource_type',
    'resource_name',
    'reason',
    'actor',
    'suspended_at'
  )
  const fields: Record<string, string> = Object.fromEntries([
    ...rows.map(row => [
      fieldOf(row.resource_type, row.resource_name),
      JSON.stringify(toSuspension(row))
    ]),
    [LOADED_FIELD, '1']
  ])
  await redis.hSet(SUSPENSIONS_KEY, fields)
  return { ...replica, ...fields }
}

const guarded = <T>(work: (progress: Progress) => Promise<T>): Promise<T> => {
  const progress: Progress = { expired: false, commitSent: false, undo: [] }
  let timer: NodeJS.Timeout | undefined
  const deadline = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      progress.expired = true
      if (!progress.commitSent) {
        for (const undo of progress.undo) {
          undo().catch((error: Error) =>
            logger.error({ err: error }, 'Catalog state undo failed')
          )
        }
      }
      reject(new CatalogStateUnavailableError(progress.commitSent))
    }, STATE_TIMEOUT_MS)
  })
  const run = work(progress).catch((error: unknown) => {
    if (
      error instanceof CatalogInvalidStateError ||
      error instanceof CatalogStateUnavailableError
    ) {
      throw error
    }
    logger.warn({ err: error }, 'Catalog state operation failed')
    throw new CatalogStateUnavailableError()
  })
  return Promise.race([run, deadline]).finally(() => clearTimeout(timer))
}

const checkpoint = (progress: Progress): void => {
  if (progress.expired) {
    throw new CatalogStateUnavailableError()
  }
}

const openTransaction = async (
  progress: Progress
): Promise<Knex.Transaction> => {
  const trx = await getDb({ operation: 'write' }).transaction()
  if (progress.expired) {
    await rollback(trx)
    throw new CatalogStateUnavailableError()
  }
  progress.undo.push(() => rollback(trx))
  return trx
}

const commit = async (
  trx: Knex.Transaction,
  progress: Progress,
  revert: () => Promise<unknown>
): Promise<void> => {
  progress.commitSent = true
  try {
    await trx.commit()
  } catch {
    try {
      await revert()
    } catch (error) {
      logger.error({ err: error }, 'Catalog replica revert failed')
      throw new CatalogStateUnavailableError(true)
    }
    throw new CatalogStateUnavailableError()
  }
}

const repairSuspended = async (
  redis: Redis,
  type: ResourceType,
  name: string
): Promise<void> => {
  const row: Row | undefined = await getDb({ operation: 'read' })<Row>(TABLE)
    .where({ resource_type: type, resource_name: name })
    .first()
  if (row) {
    await redis.hSet(
      SUSPENSIONS_KEY,
      fieldOf(type, name),
      JSON.stringify(toSuspension(row))
    )
    logger.warn({ type, name }, 'Catalog replica repaired: suspension restored')
  }
}

export const getCatalogState = (): Promise<CatalogState> => {
  const catalog = getCatalog()
  return guarded(async () => {
    const redis = await getRedis()
    const replica = await loadReplica(redis)
    const cooldowns = await redis.mGet(
      catalog.deployments.map(({ name }) => `${COOLDOWN_PREFIX}${name}`)
    )
    return {
      capabilities: Object.fromEntries(
        catalog.capabilities.map(({ name }) => {
          const suspension = parseSuspension(
            replica[fieldOf('capability', name)]
          )
          return [
            name,
            { state: suspension ? 'suspended' : 'active', suspension }
          ]
        })
      ),
      deployments: Object.fromEntries(
        catalog.deployments.map(({ name }, index) => {
          const suspension = parseSuspension(
            replica[fieldOf('deployment', name)]
          )
          const cooldownUntil = cooldowns[index] ?? null
          let state: DeploymentState['state'] = 'active'
          if (suspension) {
            state = 'suspended'
          } else if (cooldownUntil) {
            state = 'cooldown'
          }
          return [name, { state, suspension, cooldown_until: cooldownUntil }]
        })
      )
    }
  })
}

export const suspendResource = (
  type: ResourceType,
  name: string,
  input: { reason: string; actor: string }
): Promise<Suspension> =>
  guarded(async progress => {
    const suspension: Suspension = {
      reason: input.reason,
      actor: input.actor,
      suspended_at: new Date().toISOString()
    }
    const field = fieldOf(type, name)
    const redis = await getRedis()
    const replica = await loadReplica(redis)
    const trx = await openTransaction(progress)
    try {
      await trx<Row>(TABLE).insert({
        resource_type: type,
        resource_name: name,
        reason: suspension.reason,
        actor: suspension.actor,
        suspended_at: new Date(suspension.suspended_at)
      })
    } catch (error) {
      await rollback(trx)
      if (!isDuplicateKey(error)) {
        throw error
      }
      if (!replica[field]) {
        await repairSuspended(redis, type, name)
      }
      throw new CatalogInvalidStateError(type, name, true)
    }
    checkpoint(progress)
    const revert = () => redis.hDel(SUSPENSIONS_KEY, field)
    progress.undo.push(revert)
    try {
      await redis.hSet(SUSPENSIONS_KEY, field, JSON.stringify(suspension))
    } catch (error) {
      await rollback(trx)
      throw error
    }
    checkpoint(progress)
    await commit(trx, progress, revert)
    return suspension
  })

export const resumeResource = (
  type: ResourceType,
  name: string
): Promise<void> =>
  guarded(async progress => {
    const field = fieldOf(type, name)
    const where = { resource_type: type, resource_name: name }
    const redis = await getRedis()
    const replica = await loadReplica(redis)
    const trx = await openTransaction(progress)
    let row: Row | undefined
    try {
      row = await trx<Row>(TABLE).where(where).forUpdate().first()
      if (row) {
        await trx<Row>(TABLE).where(where).del()
      }
    } catch (error) {
      await rollback(trx)
      throw error
    }
    if (!row) {
      await rollback(trx)
      if (!replica[field]) {
        throw new CatalogInvalidStateError(type, name, false)
      }
      await redis.hDel(SUSPENSIONS_KEY, field)
      logger.warn({ type, name }, 'Catalog replica repaired: stale suspension')
      return
    }
    checkpoint(progress)
    const previous = JSON.stringify(toSuspension(row))
    const revert = () => redis.hSet(SUSPENSIONS_KEY, field, previous)
    progress.undo.push(revert)
    try {
      await redis.hDel(SUSPENSIONS_KEY, field)
    } catch (error) {
      await rollback(trx)
      throw error
    }
    checkpoint(progress)
    await commit(trx, progress, revert)
  })

export const unavailableCapabilities = (
  catalog: Catalog,
  state: CatalogState,
  deployment: string
): string[] =>
  catalog.capabilities
    .filter(
      ({ name, primary, fallback }) =>
        (primary === deployment || fallback === deployment) &&
        state.capabilities[name].state === 'active' &&
        [primary, fallback]
          .filter((item): item is string => item !== null)
          .every(item => state.deployments[item].state === 'suspended')
    )
    .map(({ name }) => name)
