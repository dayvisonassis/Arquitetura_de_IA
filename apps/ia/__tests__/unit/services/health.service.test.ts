jest.mock('../../../database', () => ({ getDb: jest.fn() }))
jest.mock('../../../redis-client', () => ({ ping: jest.fn() }))
jest.mock('../../../src/config/env', () => ({
  config: { db: { database: 'gateway_test' } }
}))

import { getDb } from '../../../database'
import { ping } from '../../../redis-client'
import {
  CHECK_TIMEOUT_MS,
  checkReadiness
} from '../../../src/services/health.service'

type Builder = {
  select: jest.Mock
  from: jest.Mock
  where: jest.Mock
  first: jest.Mock
}

// A new builder per getDb call; `first` decides the outcome of the query.
const createMockQueryBuilder = (first: () => Promise<unknown>): Builder => {
  const builder = {} as Builder
  builder.select = jest.fn(() => builder)
  builder.from = jest.fn(() => builder)
  builder.where = jest.fn(() => builder)
  builder.first = jest.fn(first)
  return builder
}

describe('health.service', () => {
  let builder: Builder

  const useBuilder = (first: () => Promise<unknown>): void => {
    jest.mocked(getDb).mockImplementation((() => {
      builder = createMockQueryBuilder(first)
      return builder
    }) as unknown as typeof getDb)
  }

  beforeEach(() => {
    jest.clearAllMocks()
    useBuilder(() => Promise.resolve({ SCHEMA_NAME: 'gateway_test' }))
    jest.mocked(ping).mockResolvedValue('PONG')
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it('should report ok when MySQL and Redis answer', async () => {
    await expect(checkReadiness()).resolves.toEqual({
      ok: true,
      checks: { mysql: 'ok', redis: 'ok' }
    })
    expect(getDb).toHaveBeenCalledWith({ operation: 'read' })
    expect(builder.select).toHaveBeenCalledWith('SCHEMA_NAME')
    expect(builder.from).toHaveBeenCalledWith('information_schema.SCHEMATA')
    expect(builder.where).toHaveBeenCalledWith('SCHEMA_NAME', 'gateway_test')
  })

  it.each([
    ['the query rejects', () => Promise.reject(new Error('ECONNREFUSED'))],
    ['the schema is not visible', () => Promise.resolve(undefined)]
  ])('should report MySQL as failed when %s', async (_case, first) => {
    useBuilder(first)

    await expect(checkReadiness()).resolves.toEqual({
      ok: false,
      checks: { mysql: 'fail', redis: 'ok' }
    })
  })

  it('should report MySQL as failed when getDb throws', async () => {
    jest.mocked(getDb).mockImplementation(() => {
      throw new Error('pool destroyed')
    })

    const readiness = await checkReadiness()

    expect(readiness.checks.mysql).toBe('fail')
  })

  it.each([
    ['PING rejects', () => Promise.reject(new Error('NOAUTH'))],
    ['PING answers something else', () => Promise.resolve('LOADING')]
  ])('should report Redis as failed when %s', async (_case, reply) => {
    jest.mocked(ping).mockImplementation(reply)

    await expect(checkReadiness()).resolves.toEqual({
      ok: false,
      checks: { mysql: 'ok', redis: 'fail' }
    })
  })

  it('should time out a hanging check after 2 s', async () => {
    jest.useFakeTimers()
    jest.mocked(ping).mockImplementation(() => new Promise(() => {}))

    const pending = checkReadiness()
    await jest.advanceTimersByTimeAsync(CHECK_TIMEOUT_MS)

    await expect(pending).resolves.toEqual({
      ok: false,
      checks: { mysql: 'ok', redis: 'fail' }
    })
    expect(CHECK_TIMEOUT_MS).toBe(2000)
  })
})
