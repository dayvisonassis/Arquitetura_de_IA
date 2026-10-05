jest.mock('express-rate-limit', () => ({
  rateLimit: jest.fn(() => jest.fn())
}))
jest.mock('rate-limit-redis', () => ({ RedisStore: jest.fn() }))
jest.mock('../../../redis-client', () => ({ getClient: jest.fn() }))
jest.mock('../../../src/config/env', () => ({
  config: { loginRateLimit: { windowMs: 900000, max: 20 } }
}))

import { rateLimit } from 'express-rate-limit'
import { RedisStore } from 'rate-limit-redis'
import { getClient } from '../../../redis-client'
import {
  LazyRedisStore,
  loginRateLimit
} from '../../../src/middleware/login-rate-limit.middleware'
import { AppError } from '../../../src/utils/app-error.utils'

// Captured once at import time, before beforeEach clears the mock calls.
const limiterOptions = rateLimit.mock.calls[0][0]
const limiter = rateLimit.mock.results[0].value

const KEY = '203.0.113.10'
const HITS = { totalHits: 1, resetTime: new Date('2026-10-04T12:15:00.000Z') }
// Product messages defined by the spec, in Portuguese.
const TOO_MANY_ATTEMPTS =
  'Muitas tentativas de login. Tente novamente em alguns minutos.'
const SERVICE_UNAVAILABLE =
  'Serviço temporariamente indisponível. Tente novamente em instantes.'

describe('login-rate-limit.middleware', () => {
  let client
  let connect
  let stores
  let scripts

  const createFakeStore = (options, { incrementSha, getSha } = {}) => ({
    options,
    incrementScriptSha: incrementSha ?? Promise.resolve('increment-sha'),
    getScriptSha: getSha ?? Promise.resolve('get-sha'),
    init: jest.fn(),
    increment: jest.fn().mockResolvedValue(HITS),
    decrement: jest.fn().mockResolvedValue(undefined),
    resetKey: jest.fn().mockResolvedValue(undefined)
  })

  beforeEach(() => {
    jest.clearAllMocks()
    client = { sendCommand: jest.fn().mockResolvedValue('OK') }
    connect = jest.fn().mockResolvedValue(client)
    stores = []
    // Each entry builds the script promises of the next store, lazily.
    scripts = []
    RedisStore.mockImplementation(options => {
      const build = scripts.shift()
      const store = createFakeStore(options, build ? build() : undefined)
      stores.push(store)
      return store
    })
  })

  describe('limiter options', () => {
    it('should limit by the configured window and maximum with a lazy Redis store', () => {
      expect(limiterOptions).toEqual(
        expect.objectContaining({
          windowMs: 900000,
          limit: 20,
          standardHeaders: 'draft-7',
          legacyHeaders: false
        })
      )
      expect(limiterOptions.store).toBeInstanceOf(LazyRedisStore)
      expect(limiterOptions.store.connect).toBe(getClient)
      expect(limiterOptions.store.store).toBeNull()
    })

    it('should answer 429 with the message from the handler', () => {
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn() }

      limiterOptions.handler({}, res)

      expect(res.status).toHaveBeenCalledWith(429)
      expect(res.json).toHaveBeenCalledWith({ message: TOO_MANY_ATTEMPTS })
    })
  })

  describe('LazyRedisStore', () => {
    it('should not connect when it is created', () => {
      const store = new LazyRedisStore(connect)

      expect(store.store).toBeNull()
      expect(store.options).toBeNull()
      expect(connect).not.toHaveBeenCalled()
      expect(RedisStore).not.toHaveBeenCalled()
    })

    it('should create the Redis store once, on the first call, with the rl:auth: prefix', async () => {
      const store = new LazyRedisStore(connect)

      const first = await store.increment(KEY)
      const second = await store.increment(KEY)

      expect(first).toBe(HITS)
      expect(second).toBe(HITS)
      expect(connect).toHaveBeenCalledTimes(1)
      expect(RedisStore).toHaveBeenCalledTimes(1)
      expect(RedisStore).toHaveBeenCalledWith({
        prefix: 'rl:auth:',
        sendCommand: expect.any(Function)
      })
      expect(stores[0].increment).toHaveBeenCalledTimes(2)
      expect(stores[0].increment).toHaveBeenCalledWith(KEY)
    })

    it('should forward the command arguments as one array to the Redis client', async () => {
      const store = new LazyRedisStore(connect)
      await store.increment(KEY)
      const { sendCommand } = RedisStore.mock.calls[0][0]

      const reply = await sendCommand('SCRIPT', 'LOAD', 'return 1')

      expect(reply).toBe('OK')
      expect(client.sendCommand).toHaveBeenCalledWith([
        'SCRIPT',
        'LOAD',
        'return 1'
      ])
    })

    it('should forward the limiter options to the Redis store before the first use', async () => {
      const options = { windowMs: 900000 }
      const store = new LazyRedisStore(connect)

      store.init(options)

      expect(store.options).toBe(options)
      expect(RedisStore).not.toHaveBeenCalled()

      await store.increment(KEY)

      expect(stores[0].init).toHaveBeenCalledWith(options)
      expect(stores[0].init.mock.invocationCallOrder[0]).toBeLessThan(
        stores[0].increment.mock.invocationCallOrder[0]
      )
    })

    it('should forward decrement and resetKey to the same Redis store', async () => {
      const store = new LazyRedisStore(connect)

      await store.decrement(KEY)
      await store.resetKey(KEY)

      expect(RedisStore).toHaveBeenCalledTimes(1)
      expect(stores[0].decrement).toHaveBeenCalledWith(KEY)
      expect(stores[0].resetKey).toHaveBeenCalledWith(KEY)
    })

    it('should keep no store and retry on the next call when the connection fails', async () => {
      const failure = new Error('Redis connection timed out')
      connect.mockRejectedValueOnce(failure)
      const store = new LazyRedisStore(connect)

      await expect(store.increment(KEY)).rejects.toBe(failure)
      expect(store.store).toBeNull()
      expect(RedisStore).not.toHaveBeenCalled()

      await expect(store.increment(KEY)).resolves.toBe(HITS)
      expect(connect).toHaveBeenCalledTimes(2)
      expect(RedisStore).toHaveBeenCalledTimes(1)
    })

    it('should keep no store and retry on the next call when the script load fails', async () => {
      const failure = new Error('NOSCRIPT')
      scripts.push(() => ({ incrementSha: Promise.reject(failure) }))
      const store = new LazyRedisStore(connect)

      await expect(store.increment(KEY)).rejects.toBe(failure)
      expect(store.store).toBeNull()
      expect(stores[0].init).not.toHaveBeenCalled()
      expect(stores[0].increment).not.toHaveBeenCalled()

      await expect(store.increment(KEY)).resolves.toBe(HITS)
      expect(RedisStore).toHaveBeenCalledTimes(2)
      expect(store.store).toBe(stores[1])
      expect(stores[1].increment).toHaveBeenCalledWith(KEY)
    })

    it('should swallow a failure to load the get script', async () => {
      let getSha
      scripts.push(() => {
        getSha = Promise.reject(new Error('get script failed'))
        jest.spyOn(getSha, 'catch')
        return { getSha }
      })
      const store = new LazyRedisStore(connect)

      await expect(store.increment(KEY)).resolves.toBe(HITS)

      expect(getSha.catch).toHaveBeenCalledWith(expect.any(Function))
      const [swallow] = getSha.catch.mock.calls[0]
      expect(swallow(new Error('get script failed'))).toBeUndefined()
      expect(store.store).toBe(stores[0])
    })
  })

  describe('loginRateLimit', () => {
    let req
    let res
    let next

    beforeEach(() => {
      req = { ip: KEY }
      res = { status: jest.fn().mockReturnThis(), json: jest.fn() }
      next = jest.fn()
    })

    it('should call next without arguments when the attempt is under the limit', () => {
      limiter.mockImplementation((_req, _res, done) => done())

      loginRateLimit(req, res, next)

      expect(limiter).toHaveBeenCalledWith(req, res, expect.any(Function))
      expect(next).toHaveBeenCalledTimes(1)
      expect(next.mock.calls[0][0]).toBeUndefined()
    })

    it('should answer 503 when the rate limit store fails', () => {
      limiter.mockImplementation((_req, _res, done) =>
        done(new Error('Redis connection timed out'))
      )

      loginRateLimit(req, res, next)

      expect(next).toHaveBeenCalledTimes(1)
      const [error] = next.mock.calls[0]
      expect(error).toBeInstanceOf(AppError)
      expect(error.status).toBe(503)
      expect(error.message).toBe(SERVICE_UNAVAILABLE)
      expect(error.message).not.toContain('Redis')
    })

    it('should not call next when the limiter answers 429 itself', () => {
      limiter.mockImplementation((request, response) =>
        limiterOptions.handler(request, response)
      )

      loginRateLimit(req, res, next)

      expect(next).not.toHaveBeenCalled()
      expect(res.status).toHaveBeenCalledWith(429)
      expect(res.json).toHaveBeenCalledWith({ message: TOO_MANY_ATTEMPTS })
    })
  })
})
