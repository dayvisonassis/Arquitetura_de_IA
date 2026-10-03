const MASTER_KEY = 'k'.repeat(40)

jest.mock('../../../src/config/env', () => ({
  config: { masterKey: 'k'.repeat(40) }
}))
jest.mock('crypto', () => {
  const actual = jest.requireActual('crypto')
  return { ...actual, timingSafeEqual: jest.fn(actual.timingSafeEqual) }
})

import { timingSafeEqual } from 'crypto'
import type { NextFunction, Request, Response } from 'express'
import { config } from '../../../src/config/env'
import { adminAuth } from '../../../src/middleware/admin-auth.middleware'

const UNAUTHORIZED = {
  error: {
    message: 'Chave administrativa ausente ou inválida.',
    type: 'authentication_error',
    code: 'invalid_admin_key'
  }
}

const createReq = (authorization?: string): Request =>
  ({
    get: jest.fn((name: string) =>
      name.toLowerCase() === 'authorization' ? authorization : undefined
    )
  }) as unknown as Request

describe('admin-auth.middleware', () => {
  let res: Response
  let status: jest.Mock
  let json: jest.Mock
  let next: jest.MockedFunction<NextFunction>

  beforeEach(() => {
    jest.clearAllMocks()
    json = jest.fn()
    status = jest.fn().mockReturnValue({ json })
    res = { status } as unknown as Response
    next = jest.fn()
    ;(config as { masterKey?: string }).masterKey = MASTER_KEY
  })

  it('should answer 401 without the master key', () => {
    adminAuth(createReq(undefined), res, next)

    expect(status).toHaveBeenCalledWith(401)
    expect(json).toHaveBeenCalledWith(UNAUTHORIZED)
    expect(next).not.toHaveBeenCalled()
  })

  it('should answer 401 with a wrong one', () => {
    adminAuth(createReq(`Bearer ${'w'.repeat(40)}`), res, next)

    expect(status).toHaveBeenCalledWith(401)
    expect(json).toHaveBeenCalledWith(UNAUTHORIZED)
    expect(next).not.toHaveBeenCalled()
  })

  it.each([
    ['another scheme', `Basic ${MASTER_KEY}`],
    ['a Bearer without a key', 'Bearer '],
    ['a key with spaces', `Bearer ${MASTER_KEY} extra`],
    ['a lower-case scheme', `bearer ${MASTER_KEY}`]
  ])('should answer 401 for a malformed header (%s)', (_case, header) => {
    adminAuth(createReq(header), res, next)

    expect(status).toHaveBeenCalledWith(401)
    expect(next).not.toHaveBeenCalled()
  })

  it('should answer 401 when no master key is configured', () => {
    ;(config as { masterKey?: string }).masterKey = undefined

    adminAuth(createReq(`Bearer ${MASTER_KEY}`), res, next)

    expect(status).toHaveBeenCalledWith(401)
    expect(next).not.toHaveBeenCalled()
  })

  it('should call next with the right key', () => {
    adminAuth(createReq(`Bearer ${MASTER_KEY}`), res, next)

    expect(next).toHaveBeenCalledTimes(1)
    expect(status).not.toHaveBeenCalled()
  })

  it('should compare keys in constant time', () => {
    adminAuth(createReq('Bearer short'), res, next)

    const compare = jest.mocked(timingSafeEqual)
    expect(compare).toHaveBeenCalledTimes(1)
    const [received, expected] = compare.mock.calls[0] as [Buffer, Buffer]
    expect(received).toHaveLength(32)
    expect(expected).toHaveLength(32)
    expect(received.equals(expected)).toBe(false)
  })
})
