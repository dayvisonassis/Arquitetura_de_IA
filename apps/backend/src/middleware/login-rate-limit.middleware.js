import { rateLimit } from 'express-rate-limit'
import { RedisStore } from 'rate-limit-redis'
import { getClient } from '../../redis-client'
import { config } from '../config/env'
import { MESSAGES, serviceUnavailable } from '../utils/app-error.utils'

const PREFIX = 'rl:auth:'

export class LazyRedisStore {
  constructor(connect = getClient) {
    this.connect = connect
    this.options = null
    this.store = null
  }

  init(options) {
    this.options = options
  }

  async target() {
    if (!this.store) {
      const client = await this.connect()
      const store = new RedisStore({
        prefix: PREFIX,
        sendCommand: (...args) => client.sendCommand(args)
      })
      store.getScriptSha.catch(() => {})
      await store.incrementScriptSha
      store.init(this.options)
      this.store = store
    }
    return this.store
  }

  async increment(key) {
    return (await this.target()).increment(key)
  }

  async decrement(key) {
    return (await this.target()).decrement(key)
  }

  async resetKey(key) {
    return (await this.target()).resetKey(key)
  }
}

const limiter = rateLimit({
  windowMs: config.loginRateLimit.windowMs,
  limit: config.loginRateLimit.max,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  store: new LazyRedisStore(),
  handler: (_req, res) => {
    res.status(429).json({ message: MESSAGES.tooManyAttempts })
  }
})

export const loginRateLimit = (req, res, next) =>
  limiter(req, res, error => next(error ? serviceUnavailable() : undefined))
