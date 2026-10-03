const { createClient } = require('redis')
const { config } = require('./src/config/env')
const logger = require('./src/logger').default

let client = null

const getClient = () => {
  if (!client) {
    client = createClient({
      socket: { host: config.redis.host, port: config.redis.port },
      password: config.redis.password,
      database: config.redis.db,
      name: 'ai-gateway-backend'
    })
    client.on('error', error => {
      logger.warn({ err: error }, 'Redis connection error')
    })
  }
  return client
}

const ping = async () => {
  const current = getClient()
  if (!current.isOpen) {
    await current.connect()
  }
  return current.ping()
}

const quit = async () => {
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

module.exports = { ping, quit }
