import { createClient } from 'redis'
import { config } from './src/config/env'
import logger from './src/logger'

type RedisClient = ReturnType<typeof createClient>

let client: RedisClient | null = null

const getClient = (): RedisClient => {
  if (!client) {
    client = createClient({
      socket: { host: config.redis.host, port: config.redis.port },
      password: config.redis.password,
      database: config.redis.db,
      name: 'ai-gateway-ia'
    })
    client.on('error', (error: Error) => {
      logger.warn({ err: error }, 'Redis connection error')
    })
  }
  return client
}

export const ping = async (): Promise<string> => {
  const current = getClient()
  if (!current.isOpen) {
    await current.connect()
  }
  return current.ping()
}

export const quit = async (): Promise<void> => {
  if (!client) {
    return
  }
  const current = client
  client = null
  if (current.isReady) {
    await current.quit()
  } else if (current.isOpen) {
    await current.disconnect()
  }
}
