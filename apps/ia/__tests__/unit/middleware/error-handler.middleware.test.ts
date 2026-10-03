jest.mock('../../../src/logger', () => ({
  __esModule: true,
  default: { error: jest.fn() }
}))

import type { NextFunction, Request, Response } from 'express'
import logger from '../../../src/logger'
import {
  errorHandler,
  notFound
} from '../../../src/middleware/error-handler.middleware'

describe('error-handler.middleware', () => {
  let res: Response & { headersSent: boolean }
  let status: jest.Mock
  let json: jest.Mock
  let next: jest.MockedFunction<NextFunction>

  beforeEach(() => {
    jest.clearAllMocks()
    json = jest.fn()
    status = jest.fn().mockReturnValue({ json })
    res = { status, headersSent: false } as unknown as Response & {
      headersSent: boolean
    }
    next = jest.fn()
  })

  it('notFound should answer 404 not_found in the proxy format', () => {
    notFound({} as Request, res)

    expect(status).toHaveBeenCalledWith(404)
    expect(json).toHaveBeenCalledWith({
      error: {
        message: 'Rota não encontrada.',
        type: 'invalid_request_error',
        code: 'not_found'
      }
    })
  })

  it('should answer 400 invalid_request for invalid JSON', () => {
    const error = Object.assign(new SyntaxError('Unexpected token'), {
      type: 'entity.parse.failed'
    })

    errorHandler(error, {} as Request, res, next)

    expect(status).toHaveBeenCalledWith(400)
    expect(json).toHaveBeenCalledWith({
      error: {
        message: 'JSON inválido.',
        type: 'invalid_request_error',
        code: 'invalid_request'
      }
    })
  })

  it('should answer 500 internal_error and log the error with the request id', () => {
    const error = new Error('redis exploded')
    const log = { error: jest.fn() }
    const req = { id: 'a'.repeat(32), log } as unknown as Request

    errorHandler(error, req, res, next)

    expect(status).toHaveBeenCalledWith(500)
    expect(json).toHaveBeenCalledWith({
      error: {
        message: 'Erro interno. Tente novamente.',
        type: 'server_error',
        code: 'internal_error'
      }
    })
    expect(log.error).toHaveBeenCalledWith(
      { err: error, requestId: req.id },
      'Unhandled error'
    )
    expect(logger.error).not.toHaveBeenCalled()
  })

  it('should fall back to the app logger without a request logger', () => {
    const error = new Error('boom')

    errorHandler(error, { id: 'b'.repeat(32) } as Request, res, next)

    expect(logger.error).toHaveBeenCalledWith(
      { err: error, requestId: 'b'.repeat(32) },
      'Unhandled error'
    )
  })

  it('should delegate to next when the response was already sent', () => {
    const error = new Error('late')
    res.headersSent = true

    errorHandler(error, {} as Request, res, next)

    expect(next).toHaveBeenCalledWith(error)
    expect(status).not.toHaveBeenCalled()
  })
})
