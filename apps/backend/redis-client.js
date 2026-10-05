const { createClient } = require('redis')
const { config } = require('./src/config/env')
const logger = require('./src/logger').default

const CONNECT_TIMEOUT_MS = 2000

let client = null
let connecting = null

const createRedisClient = () => {
  const created = createClient({
    socket: {
      host: config.redis.host,
      port: config.redis.port,
      connectTimeout: CONNECT_TIMEOUT_MS
    },
    password: config.redis.password,
    database: config.redis.db,
    name: 'ai-gateway-backend',
    disableOfflineQueue: true
  })
  created.on('error', error => {
    logger.warn({ err: error }, 'Redis connection error')
  })
  return created
}

const withTimeout = promise => {
  let timer
  const timeout = new Promise((_resolve, reject) => {
    timer = setTimeout(
      () => reject(new Error('Redis connection timed out')),
      CONNECT_TIMEOUT_MS
    )
  })
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer))
}

const getClient = () => {
  if (!client) {
    client = createRedisClient()
  }
  if (client.isReady) {
    return Promise.resolve(client)
  }
  if (!connecting) {
    const current = client
    const opening = current.isOpen ? Promise.resolve() : current.connect()
    connecting = withTimeout(
      opening.then(() =>
        current.isReady
          ? current
          : new Promise(resolve =>
              current.once('ready', () => resolve(current))
            )
      )
    ).finally(() => {
      connecting = null
    })
  }
  return connecting
}

const ping = async () => {
  const current = await getClient()
  return current.ping()
}

const quit = async () => {
  if (!client) {
    return
  }
  const current = client
  client = null
  connecting = null
  if (current.isReady) {
    await current.quit()
  } else if (current.isOpen) {
    await current.disconnect()
  }
}

module.exports = { getClient, ping, quit }
