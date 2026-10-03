import db from '../../database'
import { ping } from '../../redis-client'
import { config } from '../config/env'

export const CHECK_TIMEOUT_MS = 2000

const withTimeout = promise => {
  let timer
  const timeout = new Promise((_resolve, reject) => {
    timer = setTimeout(
      () => reject(new Error('Health check timed out')),
      CHECK_TIMEOUT_MS
    )
  })
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer))
}

const outcome = async check => {
  try {
    await withTimeout(check())
    return 'ok'
  } catch {
    return 'fail'
  }
}

const checkMysql = async () => {
  const schema = await db
    .getDb({ operation: 'read' })
    .select('SCHEMA_NAME')
    .from('information_schema.SCHEMATA')
    .where('SCHEMA_NAME', config.db.database)
    .first()
  if (!schema) {
    throw new Error('Schema not visible to the database user')
  }
}

const checkRedis = async () => {
  if ((await ping()) !== 'PONG') {
    throw new Error('Unexpected Redis reply')
  }
}

export const checkReadiness = async () => {
  const [mysql, redis] = await Promise.all([
    outcome(checkMysql),
    outcome(checkRedis)
  ])
  return { ok: mysql === 'ok' && redis === 'ok', checks: { mysql, redis } }
}
