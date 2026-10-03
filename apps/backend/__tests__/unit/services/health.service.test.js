jest.mock('../../../database', () => ({ getDb: jest.fn() }))
jest.mock('../../../redis-client', () => ({ ping: jest.fn() }))
jest.mock('../../../src/config/env', () => ({
  config: { db: { database: 'web_test' } }
}))

import db from '../../../database'
import { ping } from '../../../redis-client'
import {
  CHECK_TIMEOUT_MS,
  checkReadiness
} from '../../../src/services/health.service'

// A new builder per getDb call; `first` decides the outcome of the query.
const createMockQueryBuilder = first => ({
  select: jest.fn().mockReturnThis(),
  from: jest.fn().mockReturnThis(),
  where: jest.fn().mockReturnThis(),
  first: jest.fn(first)
})

describe('health.service', () => {
  let builder

  const useBuilder = first => {
    db.getDb.mockImplementation(() => {
      builder = createMockQueryBuilder(first)
      return builder
    })
  }

  beforeEach(() => {
    jest.clearAllMocks()
    useBuilder(() => Promise.resolve({ SCHEMA_NAME: 'web_test' }))
    ping.mockResolvedValue('PONG')
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it('should report ok when MySQL and Redis answer', async () => {
    const readiness = await checkReadiness()

    expect(readiness).toEqual({
      ok: true,
      checks: { mysql: 'ok', redis: 'ok' }
    })
    expect(db.getDb).toHaveBeenCalledWith({ operation: 'read' })
    expect(builder.select).toHaveBeenCalledWith('SCHEMA_NAME')
    expect(builder.from).toHaveBeenCalledWith('information_schema.SCHEMATA')
    expect(builder.where).toHaveBeenCalledWith('SCHEMA_NAME', 'web_test')
  })

  it.each([
    ['the query rejects', () => Promise.reject(new Error('ECONNREFUSED'))],
    ['the schema is not visible', () => Promise.resolve(undefined)]
  ])('should return 503 when MySQL fails (%s)', async (_case, first) => {
    useBuilder(first)

    await expect(checkReadiness()).resolves.toEqual({
      ok: false,
      checks: { mysql: 'fail', redis: 'ok' }
    })
  })

  it('should report the MySQL check as failed when getDb throws', async () => {
    db.getDb.mockImplementation(() => {
      throw new Error('pool destroyed')
    })

    const readiness = await checkReadiness()

    expect(readiness.checks.mysql).toBe('fail')
  })

  it.each([
    ['PING rejects', () => Promise.reject(new Error('NOAUTH'))],
    ['PING answers something else', () => Promise.resolve('LOADING')]
  ])('should report Redis as failed when %s', async (_case, reply) => {
    ping.mockImplementation(reply)

    await expect(checkReadiness()).resolves.toEqual({
      ok: false,
      checks: { mysql: 'ok', redis: 'fail' }
    })
  })

  it('should time out a hanging check after 2 s', async () => {
    jest.useFakeTimers()
    useBuilder(() => new Promise(() => {}))

    const pending = checkReadiness()
    await jest.advanceTimersByTimeAsync(CHECK_TIMEOUT_MS)

    await expect(pending).resolves.toEqual({
      ok: false,
      checks: { mysql: 'fail', redis: 'ok' }
    })
    expect(CHECK_TIMEOUT_MS).toBe(2000)
  })
})
