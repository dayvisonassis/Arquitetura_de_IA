import { createClient } from 'redis'
import { config } from './src/config/env'
import logger from './src/logger'

type RedisClient = ReturnType<typeof createClient>

const REDIS_READY_TIMEOUT_MS = 2000

let client: RedisClient | null = null
let pending: Promise<RedisClient> | null = null

const createRedisClient = (): RedisClient => {
  const created = createClient({
    socket: { host: config.redis.host, port: config.redis.port },
    password: config.redis.password,
    database: config.redis.db,
    name: 'ai-gateway-ia',
    disableOfflineQueue: true
  })
  created.on('error', (error: Error) => {
    logger.warn({ err: error }, 'Redis connection error')
  })
  return created
}

const whenReady = (current: RedisClient): Promise<RedisClient> => {
  if (current.isReady) {
    return Promise.resolve(current)
  }
  if (!pending) {
    pending = new Promise<RedisClient>((resolve, reject) => {
      const onReady = (): void => resolve(current)
      current.once('ready', onReady)
      if (!current.isOpen) {
        current.connect().catch((error: Error) => {
          current.off('ready', onReady)
          reject(error)
        })
      }
    }).finally(() => {
      pending = null
    })
  }
  return pending
}

const withDeadline = (ready: Promise<RedisClient>): Promise<RedisClient> => {
  let timer: NodeJS.Timeout | undefined
  const deadline = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(
      () => reject(new Error('Redis is not ready')),
      REDIS_READY_TIMEOUT_MS
    )
  })
  return Promise.race([ready, deadline]).finally(() => clearTimeout(timer))
}

export const getRedis = (): Promise<RedisClient> => {
  if (!client) {
    client = createRedisClient()
  }
  return withDeadline(whenReady(client))
}

export const ping = async (): Promise<string> => (await getRedis()).ping()

export const quit = async (): Promise<void> => {
  if (!client) {
    return
  }
  const current = client
  client = null
  pending = null
  if (current.isReady) {
    await current.quit()
  } else if (current.isOpen) {
    await current.disconnect()
  }
}
