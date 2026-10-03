import { getDb } from '../../database'
import { ping } from '../../redis-client'
import { config } from '../config/env'

export const CHECK_TIMEOUT_MS = 2000

type CheckOutcome = 'ok' | 'fail'

type Readiness = {
  ok: boolean
  checks: { mysql: CheckOutcome; redis: CheckOutcome }
}

const withTimeout = <T>(promise: Promise<T>): Promise<T> => {
  let timer: NodeJS.Timeout | undefined
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(
      () => reject(new Error('Health check timed out')),
      CHECK_TIMEOUT_MS
    )
  })
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer))
}

const outcome = async (check: () => Promise<void>): Promise<CheckOutcome> => {
  try {
    await withTimeout(check())
    return 'ok'
  } catch {
    return 'fail'
  }
}

const checkMysql = async (): Promise<void> => {
  const schema = await getDb({ operation: 'read' })
    .select('SCHEMA_NAME')
    .from('information_schema.SCHEMATA')
    .where('SCHEMA_NAME', String(config.db.database))
    .first()
  if (!schema) {
    throw new Error('Schema not visible to the database user')
  }
}

const checkRedis = async (): Promise<void> => {
  if ((await ping()) !== 'PONG') {
    throw new Error('Unexpected Redis reply')
  }
}

export const checkReadiness = async (): Promise<Readiness> => {
  const [mysql, redis] = await Promise.all([
    outcome(checkMysql),
    outcome(checkRedis)
  ])
  return { ok: mysql === 'ok' && redis === 'ok', checks: { mysql, redis } }
}
