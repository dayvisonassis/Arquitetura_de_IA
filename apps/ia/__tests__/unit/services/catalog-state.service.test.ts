jest.mock('../../../database', () => ({ getDb: jest.fn() }))
jest.mock('../../../redis-client', () => ({ getRedis: jest.fn() }))
jest.mock('../../../src/config/catalog', () => ({ getCatalog: jest.fn() }))
jest.mock('../../../src/logger', () => ({
  __esModule: true,
  default: { warn: jest.fn(), error: jest.fn(), info: jest.fn() }
}))

import { getDb } from '../../../database'
import { getRedis } from '../../../redis-client'
import { getCatalog, type Catalog } from '../../../src/config/catalog'
import logger from '../../../src/logger'
import {
  CatalogInvalidStateError,
  CatalogStateUnavailableError,
  getCatalogState,
  resumeResource,
  STATE_TIMEOUT_MS,
  suspendResource,
  unavailableCapabilities,
  type CatalogState
} from '../../../src/services/catalog-state.service'

type Mock = jest.Mock

const NOW = new Date('2026-10-04T14:05:12.345Z')
const LOADED = { _loaded: '1' }

const deployment = (name: string) => ({
  name,
  provider: 'openai' as const,
  model: name,
  params: ['max_tokens'],
  param_mappings: {},
  fixed_params: {},
  price_per_million_tokens: { input: 1, output: 1 }
})

const capability = (
  name: string,
  primary: string,
  fallback: string | null
) => ({
  name,
  type: 'chat' as const,
  description: name,
  primary,
  fallback,
  timeout_seconds: 10,
  max_retries: 1,
  max_tokens: 256,
  json_mode: false,
  contract: null
})

const CATALOG: Catalog = {
  deployments: [deployment('primary-a'), deployment('backup-b')],
  capabilities: [
    capability('ticket-classifier', 'primary-a', 'backup-b'),
    capability('release-notes-writer', 'primary-a', null)
  ]
}

const suspensionJson = (reason = 'incident') =>
  JSON.stringify({
    reason,
    actor: 'admin@aigateway.test',
    suspended_at: NOW.toISOString()
  })

// A promise that only settles when the test says so.
const deferred = <T>() => {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

let redis: Record<'hGetAll' | 'hSet' | 'hDel' | 'mGet', Mock>
let readBuilder: Record<'select' | 'where' | 'first', Mock>
let readDb: Mock
let trxBuilder: Record<'insert' | 'where' | 'forUpdate' | 'first' | 'del', Mock>
let trx: Mock & Record<'commit' | 'rollback' | 'isCompleted', Mock>
let writeDb: Mock & { transaction: Mock }

const setUpMocks = (): void => {
  redis = {
    hGetAll: jest.fn().mockResolvedValue({ ...LOADED }),
    hSet: jest.fn().mockResolvedValue(1),
    hDel: jest.fn().mockResolvedValue(1),
    mGet: jest.fn().mockResolvedValue([null, null])
  }
  readBuilder = {
    select: jest.fn().mockResolvedValue([]),
    where: jest.fn().mockReturnThis(),
    first: jest.fn().mockResolvedValue(undefined)
  }
  readDb = jest.fn(() => readBuilder)
  trxBuilder = {
    insert: jest.fn().mockResolvedValue([0]),
    where: jest.fn().mockReturnThis(),
    forUpdate: jest.fn().mockReturnThis(),
    first: jest.fn().mockResolvedValue(undefined),
    del: jest.fn().mockResolvedValue(1)
  }
  let completed = false
  trx = Object.assign(
    jest.fn(() => trxBuilder),
    {
      commit: jest.fn(async () => {
        completed = true
      }),
      rollback: jest.fn(async () => {
        completed = true
      }),
      isCompleted: jest.fn(() => completed)
    }
  )
  writeDb = Object.assign(jest.fn(), {
    transaction: jest.fn().mockResolvedValue(trx)
  })
  jest
    .mocked(getDb)
    .mockImplementation(((operation: { operation: string }) =>
      operation.operation === 'read' ? readDb : writeDb) as never)
  jest.mocked(getRedis).mockResolvedValue(redis as never)
  jest.mocked(getCatalog).mockReturnValue(CATALOG)
}

const settle = async (): Promise<void> => {
  for (let index = 0; index < 10; index += 1) {
    await Promise.resolve()
  }
}

describe('catalog-state.service', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    jest.useFakeTimers({ now: NOW })
    setUpMocks()
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  describe('errors', () => {
    it('should describe the invalid state of a resource', () => {
      const already = new CatalogInvalidStateError('capability', 'x', true)
      const not = new CatalogInvalidStateError('deployment', 'y', false)

      expect(already.message).toBe("capability 'x' is already suspended")
      expect(not.message).toBe("deployment 'y' is not suspended")
      expect(already).toMatchObject({
        name: 'CatalogInvalidStateError',
        type: 'capability',
        resource: 'x',
        suspended: true
      })
    })

    it('should tell an unconfirmed change from an unavailable state', () => {
      expect(new CatalogStateUnavailableError()).toMatchObject({
        name: 'CatalogStateUnavailableError',
        unconfirmed: false,
        message: 'Catalog state is unavailable'
      })
      expect(new CatalogStateUnavailableError(true).message).toBe(
        'Catalog state change could not be confirmed'
      )
    })
  })

  describe('getCatalogState', () => {
    it('should reload the replica from MySQL when the sentinel is missing', async () => {
      redis.hGetAll.mockResolvedValue({})
      readBuilder.select.mockResolvedValue([
        {
          resource_type: 'capability',
          resource_name: 'ticket-classifier',
          reason: 'incident',
          actor: 'admin@aigateway.test',
          suspended_at: NOW
        }
      ])

      const state = await getCatalogState()

      expect(readDb).toHaveBeenCalledTimes(1)
      expect(readDb).toHaveBeenCalledWith('catalog_suspensions')
      expect(redis.hSet).toHaveBeenCalledWith('catalog:suspensions', {
        'capability:ticket-classifier': suspensionJson(),
        _loaded: '1'
      })
      expect(state.capabilities['ticket-classifier']).toEqual({
        state: 'suspended',
        suspension: JSON.parse(suspensionJson())
      })
    })

    it('should not query MySQL when the replica is loaded', async () => {
      await getCatalogState()

      expect(readDb).not.toHaveBeenCalled()
      expect(redis.hSet).not.toHaveBeenCalled()
    })

    it('should use the read connection to reload and the write connection to change', async () => {
      redis.hGetAll.mockResolvedValue({})

      await getCatalogState()
      await suspendResource('capability', 'ticket-classifier', {
        reason: 'incident',
        actor: 'admin@aigateway.test'
      })

      expect(getDb).toHaveBeenCalledWith({ operation: 'read' })
      expect(getDb).toHaveBeenCalledWith({ operation: 'write' })
      expect(writeDb.transaction).toHaveBeenCalledTimes(1)
    })

    it('should rank suspended over cooldown over active', async () => {
      const until = '2026-10-04T14:06:00.000Z'
      redis.hGetAll.mockResolvedValue({
        ...LOADED,
        'deployment:primary-a': suspensionJson(),
        'capability:release-notes-writer': suspensionJson('cost')
      })
      redis.mGet.mockResolvedValue([until, until])

      const state = await getCatalogState()

      expect(redis.mGet).toHaveBeenCalledWith([
        'catalog:cooldown:primary-a',
        'catalog:cooldown:backup-b'
      ])
      expect(state.deployments['primary-a']).toEqual({
        state: 'suspended',
        suspension: JSON.parse(suspensionJson()),
        cooldown_until: until
      })
      expect(state.deployments['backup-b']).toEqual({
        state: 'cooldown',
        suspension: null,
        cooldown_until: until
      })
      expect(state.capabilities['ticket-classifier'].state).toBe('active')
      expect(state.capabilities['release-notes-writer'].state).toBe('suspended')
    })

    it('should report active resources without suspension or cooldown', async () => {
      const state = await getCatalogState()

      expect(state.deployments['backup-b']).toEqual({
        state: 'active',
        suspension: null,
        cooldown_until: null
      })
    })

    it('should answer unavailable when Redis refuses an offline command', async () => {
      redis.hGetAll.mockRejectedValue(new Error('The client is offline'))

      await expect(getCatalogState()).rejects.toBeInstanceOf(
        CatalogStateUnavailableError
      )
      expect(logger.warn).toHaveBeenCalled()
    })

    it('should give up after the 2 s deadline', async () => {
      redis.hGetAll.mockReturnValue(new Promise(() => undefined))

      const result = getCatalogState()
      const assertion = expect(result).rejects.toMatchObject({
        unconfirmed: false
      })
      await jest.advanceTimersByTimeAsync(STATE_TIMEOUT_MS)

      await assertion
    })
  })

  describe('suspendResource', () => {
    const suspend = () =>
      suspendResource('deployment', 'primary-a', {
        reason: 'incident',
        actor: 'admin@aigateway.test'
      })

    it('should write the same suspended_at to MySQL and Redis', async () => {
      const suspension = await suspend()

      expect(suspension).toEqual(JSON.parse(suspensionJson()))
      expect(trx).toHaveBeenCalledWith('catalog_suspensions')
      expect(trxBuilder.insert).toHaveBeenCalledWith({
        resource_type: 'deployment',
        resource_name: 'primary-a',
        reason: 'incident',
        actor: 'admin@aigateway.test',
        suspended_at: NOW
      })
      expect(redis.hSet).toHaveBeenCalledWith(
        'catalog:suspensions',
        'deployment:primary-a',
        suspensionJson()
      )
      expect(trx.commit).toHaveBeenCalledTimes(1)
      expect(trx.rollback).not.toHaveBeenCalled()
    })

    it('should map a duplicate key to invalid state', async () => {
      redis.hGetAll.mockResolvedValue({
        ...LOADED,
        'deployment:primary-a': suspensionJson()
      })
      trxBuilder.insert.mockRejectedValue({ code: 'ER_DUP_ENTRY' })

      await expect(suspend()).rejects.toMatchObject({
        name: 'CatalogInvalidStateError',
        suspended: true
      })
      expect(trx.rollback).toHaveBeenCalledTimes(1)
      expect(readDb).not.toHaveBeenCalled()
      expect(redis.hSet).not.toHaveBeenCalled()
    })

    it('suspend should rewrite a missing replica field from the MySQL row', async () => {
      trxBuilder.insert.mockRejectedValue({ code: 'ER_DUP_ENTRY' })
      readBuilder.first.mockResolvedValue({
        resource_type: 'deployment',
        resource_name: 'primary-a',
        reason: 'incident',
        actor: 'admin@aigateway.test',
        suspended_at: NOW
      })

      await expect(suspend()).rejects.toBeInstanceOf(CatalogInvalidStateError)
      expect(readBuilder.where).toHaveBeenCalledWith({
        resource_type: 'deployment',
        resource_name: 'primary-a'
      })
      expect(redis.hSet).toHaveBeenCalledWith(
        'catalog:suspensions',
        'deployment:primary-a',
        suspensionJson()
      )
      expect(logger.warn).toHaveBeenCalledWith(
        { type: 'deployment', name: 'primary-a' },
        'Catalog replica repaired: suspension restored'
      )
    })

    it('should not repair when the duplicate row is already gone', async () => {
      trxBuilder.insert.mockRejectedValue({ code: 'ER_DUP_ENTRY' })

      await expect(suspend()).rejects.toBeInstanceOf(CatalogInvalidStateError)
      expect(redis.hSet).not.toHaveBeenCalled()
    })

    it('should answer unavailable when the insert fails', async () => {
      trxBuilder.insert.mockRejectedValue(new Error('MySQL went away'))

      await expect(suspend()).rejects.toBeInstanceOf(
        CatalogStateUnavailableError
      )
      expect(trx.rollback).toHaveBeenCalledTimes(1)
      expect(redis.hSet).not.toHaveBeenCalled()
    })

    it('should roll back MySQL when Redis fails during suspend', async () => {
      redis.hSet.mockRejectedValue(new Error('The client is offline'))

      await expect(suspend()).rejects.toMatchObject({ unconfirmed: false })
      expect(trx.rollback).toHaveBeenCalledTimes(1)
      expect(trx.commit).not.toHaveBeenCalled()
    })

    it('should answer unavailable when Redis refuses an offline command', async () => {
      jest
        .mocked(getRedis)
        .mockRejectedValue(new Error('Redis is not ready') as never)

      await expect(suspend()).rejects.toBeInstanceOf(
        CatalogStateUnavailableError
      )
      expect(writeDb.transaction).not.toHaveBeenCalled()
    })

    it('should give up and roll back after the 2 s deadline', async () => {
      const insert = deferred<number[]>()
      trxBuilder.insert.mockReturnValue(insert.promise)

      const result = suspend()
      const assertion = expect(result).rejects.toMatchObject({
        unconfirmed: false
      })
      await jest.advanceTimersByTimeAsync(STATE_TIMEOUT_MS)
      await assertion
      expect(trx.rollback).toHaveBeenCalledTimes(1)

      insert.resolve([0])
      await settle()
      expect(redis.hSet).not.toHaveBeenCalled()
      expect(trx.commit).not.toHaveBeenCalled()
    })

    it('should send the revert behind a Redis command that timed out', async () => {
      redis.hSet.mockReturnValue(new Promise(() => undefined))

      const result = suspend()
      const assertion = expect(result).rejects.toBeInstanceOf(
        CatalogStateUnavailableError
      )
      await jest.advanceTimersByTimeAsync(STATE_TIMEOUT_MS)
      await assertion

      expect(redis.hDel).toHaveBeenCalledWith(
        'catalog:suspensions',
        'deployment:primary-a'
      )
      expect(trx.rollback).toHaveBeenCalledTimes(1)
    })

    it('should roll back a transaction whose connection arrives after the deadline', async () => {
      const transaction = deferred<typeof trx>()
      writeDb.transaction.mockReturnValue(transaction.promise)

      const result = suspend()
      const assertion = expect(result).rejects.toBeInstanceOf(
        CatalogStateUnavailableError
      )
      await jest.advanceTimersByTimeAsync(STATE_TIMEOUT_MS)
      await assertion

      transaction.resolve(trx)
      await settle()
      expect(trx.rollback).toHaveBeenCalledTimes(1)
      expect(trxBuilder.insert).not.toHaveBeenCalled()
    })

    it('should log an undo that fails at the deadline', async () => {
      trxBuilder.insert.mockReturnValue(new Promise(() => undefined))
      trx.rollback.mockRejectedValue(new Error('connection lost'))

      const result = suspend()
      const assertion = expect(result).rejects.toBeInstanceOf(
        CatalogStateUnavailableError
      )
      await jest.advanceTimersByTimeAsync(STATE_TIMEOUT_MS)
      await assertion
      await settle()

      expect(logger.error).toHaveBeenCalledWith(
        { err: expect.any(Error) },
        'Catalog state undo failed'
      )
    })

    it('should not revert Redis once the commit was sent', async () => {
      trx.commit.mockReturnValue(new Promise(() => undefined))

      const result = suspend()
      const assertion = expect(result).rejects.toMatchObject({
        unconfirmed: true
      })
      await jest.advanceTimersByTimeAsync(STATE_TIMEOUT_MS)
      await assertion

      expect(redis.hDel).not.toHaveBeenCalled()
      expect(trx.rollback).not.toHaveBeenCalled()
    })

    it('should revert Redis when the commit fails', async () => {
      trx.commit.mockRejectedValue(new Error('commit failed'))

      await expect(suspend()).rejects.toMatchObject({ unconfirmed: false })
      expect(redis.hDel).toHaveBeenCalledWith(
        'catalog:suspensions',
        'deployment:primary-a'
      )
    })

    it('should report an unconfirmed change when the revert also fails', async () => {
      trx.commit.mockRejectedValue(new Error('commit failed'))
      redis.hDel.mockRejectedValue(new Error('The client is offline'))

      await expect(suspend()).rejects.toMatchObject({ unconfirmed: true })
      expect(logger.error).toHaveBeenCalledWith(
        { err: expect.any(Error) },
        'Catalog replica revert failed'
      )
    })
  })

  describe('resumeResource', () => {
    const row = {
      resource_type: 'capability',
      resource_name: 'ticket-classifier',
      reason: 'incident',
      actor: 'admin@aigateway.test',
      suspended_at: NOW
    }
    const resume = () => resumeResource('capability', 'ticket-classifier')

    beforeEach(() => {
      redis.hGetAll.mockResolvedValue({
        ...LOADED,
        'capability:ticket-classifier': suspensionJson()
      })
      trxBuilder.first.mockResolvedValue(row)
    })

    it('should delete the row and the replica field, then commit', async () => {
      await expect(resume()).resolves.toBeUndefined()

      expect(trxBuilder.forUpdate).toHaveBeenCalled()
      expect(trxBuilder.where).toHaveBeenCalledWith({
        resource_type: 'capability',
        resource_name: 'ticket-classifier'
      })
      expect(trxBuilder.del).toHaveBeenCalledTimes(1)
      expect(redis.hDel).toHaveBeenCalledWith(
        'catalog:suspensions',
        'capability:ticket-classifier'
      )
      expect(trx.commit).toHaveBeenCalledTimes(1)
    })

    it('resume should heal a replica field without a MySQL row', async () => {
      trxBuilder.first.mockResolvedValue(undefined)

      await expect(resume()).resolves.toBeUndefined()

      expect(trx.rollback).toHaveBeenCalledTimes(1)
      expect(trxBuilder.del).not.toHaveBeenCalled()
      expect(redis.hDel).toHaveBeenCalledWith(
        'catalog:suspensions',
        'capability:ticket-classifier'
      )
      expect(logger.warn).toHaveBeenCalledWith(
        { type: 'capability', name: 'ticket-classifier' },
        'Catalog replica repaired: stale suspension'
      )
    })

    it('should answer invalid state for an active resource', async () => {
      redis.hGetAll.mockResolvedValue({ ...LOADED })
      trxBuilder.first.mockResolvedValue(undefined)

      await expect(resume()).rejects.toMatchObject({
        name: 'CatalogInvalidStateError',
        suspended: false
      })
      expect(redis.hDel).not.toHaveBeenCalled()
    })

    it('should roll back when the row cannot be read', async () => {
      trxBuilder.first.mockRejectedValue(new Error('MySQL went away'))

      await expect(resume()).rejects.toBeInstanceOf(
        CatalogStateUnavailableError
      )
      expect(trx.rollback).toHaveBeenCalledTimes(1)
    })

    it('should roll back when Redis fails during resume', async () => {
      redis.hDel.mockRejectedValue(new Error('The client is offline'))

      await expect(resume()).rejects.toBeInstanceOf(
        CatalogStateUnavailableError
      )
      expect(trx.rollback).toHaveBeenCalledTimes(1)
      expect(trx.commit).not.toHaveBeenCalled()
    })

    it('should restore the replica field when the commit fails', async () => {
      trx.commit.mockRejectedValue(new Error('commit failed'))

      await expect(resume()).rejects.toMatchObject({ unconfirmed: false })
      expect(redis.hSet).toHaveBeenCalledWith(
        'catalog:suspensions',
        'capability:ticket-classifier',
        suspensionJson()
      )
    })

    it('should stop before touching Redis when the deadline passed during the delete', async () => {
      const removal = deferred<number>()
      trxBuilder.del.mockReturnValue(removal.promise)

      const result = resume()
      const assertion = expect(result).rejects.toBeInstanceOf(
        CatalogStateUnavailableError
      )
      await jest.advanceTimersByTimeAsync(STATE_TIMEOUT_MS)
      await assertion

      removal.resolve(1)
      await settle()
      expect(redis.hDel).not.toHaveBeenCalled()
      expect(trx.rollback).toHaveBeenCalledTimes(1)
    })
  })

  describe('unavailableCapabilities', () => {
    const stateWith = (
      deployments: Record<string, 'active' | 'suspended' | 'cooldown'>,
      capabilities: Record<string, 'active' | 'suspended'> = {}
    ): CatalogState => ({
      capabilities: Object.fromEntries(
        CATALOG.capabilities.map(({ name }) => [
          name,
          { state: capabilities[name] ?? 'active', suspension: null }
        ])
      ),
      deployments: Object.fromEntries(
        CATALOG.deployments.map(({ name }) => [
          name,
          {
            state: deployments[name] ?? 'active',
            suspension: null,
            cooldown_until: null
          }
        ])
      )
    })

    it('should warn about capabilities left without a non-suspended deployment', () => {
      expect(
        unavailableCapabilities(
          CATALOG,
          stateWith({ 'primary-a': 'suspended' }),
          'primary-a'
        )
      ).toEqual(['release-notes-writer'])
      expect(
        unavailableCapabilities(
          CATALOG,
          stateWith({ 'primary-a': 'suspended', 'backup-b': 'suspended' }),
          'primary-a'
        )
      ).toEqual(['ticket-classifier', 'release-notes-writer'])
    })

    it('should not warn when another deployment is still usable', () => {
      expect(
        unavailableCapabilities(
          CATALOG,
          stateWith({ 'backup-b': 'suspended' }),
          'backup-b'
        )
      ).toEqual([])
      expect(
        unavailableCapabilities(
          CATALOG,
          stateWith({ 'primary-a': 'cooldown', 'backup-b': 'suspended' }),
          'backup-b'
        )
      ).toEqual([])
    })

    it('should not warn about a capability that is already suspended', () => {
      expect(
        unavailableCapabilities(
          CATALOG,
          stateWith(
            { 'primary-a': 'suspended' },
            { 'release-notes-writer': 'suspended' }
          ),
          'primary-a'
        )
      ).toEqual([])
    })
  })
})
