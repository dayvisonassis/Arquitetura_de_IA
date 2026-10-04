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

type HttpError = Error & { type?: string }

// Mirrors the errors that body-parser passes to next().
const bodyParserError = (type: string): HttpError =>
  Object.assign(new Error('body-parser failure'), { type })

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

  describe('notFound', () => {
    it('should answer 404 not_found in the OpenAI format', () => {
      notFound({} as Request, res)

      expect(status).toHaveBeenCalledWith(404)
      expect(json).toHaveBeenCalledWith({
        error: {
          message: 'Unknown route.',
          type: 'invalid_request_error',
          code: 'not_found'
        }
      })
      expect(logger.error).not.toHaveBeenCalled()
    })
  })

  describe('errorHandler', () => {
    it('should delegate to next and write nothing when the headers were already sent', () => {
      const error = bodyParserError('entity.parse.failed')
      res.headersSent = true

      errorHandler(error, {} as Request, res, next)

      expect(next).toHaveBeenCalledTimes(1)
      expect(next).toHaveBeenCalledWith(error)
      expect(status).not.toHaveBeenCalled()
      expect(json).not.toHaveBeenCalled()
      expect(logger.error).not.toHaveBeenCalled()
    })

    it('should answer 400 invalid_json when the body is not valid JSON', () => {
      errorHandler(
        bodyParserError('entity.parse.failed'),
        {} as Request,
        res,
        next
      )

      expect(status).toHaveBeenCalledWith(400)
      expect(json).toHaveBeenCalledWith({
        error: {
          message: 'The request body is not valid JSON.',
          type: 'invalid_request_error',
          code: 'invalid_json'
        }
      })
      expect(next).not.toHaveBeenCalled()
      expect(logger.error).not.toHaveBeenCalled()
    })

    it('should answer 413 request_too_large when the body exceeds the limit', () => {
      errorHandler(
        bodyParserError('entity.too.large'),
        {} as Request,
        res,
        next
      )

      expect(status).toHaveBeenCalledWith(413)
      expect(json).toHaveBeenCalledWith({
        error: {
          message: 'The request body is larger than 2 MB.',
          type: 'invalid_request_error',
          code: 'request_too_large'
        }
      })
      expect(next).not.toHaveBeenCalled()
      expect(logger.error).not.toHaveBeenCalled()
    })

    it('should log any other error and answer 500 internal_error', () => {
      const error = new Error('unexpected failure')

      errorHandler(error, {} as Request, res, next)

      expect(logger.error).toHaveBeenCalledTimes(1)
      expect(logger.error).toHaveBeenCalledWith(
        { err: error },
        'Unhandled error'
      )
      expect(status).toHaveBeenCalledWith(500)
      expect(json).toHaveBeenCalledWith({
        error: {
          message: 'Internal error.',
          type: 'server_error',
          code: 'internal_error'
        }
      })
      expect(next).not.toHaveBeenCalled()
    })

    it('should treat an unknown body-parser type as an internal error', () => {
      // e.g. an unsupported charset is not one of the two mapped types.
      const error = bodyParserError('charset.unsupported')

      errorHandler(error, {} as Request, res, next)

      expect(logger.error).toHaveBeenCalledWith(
        { err: error },
        'Unhandled error'
      )
      expect(status).toHaveBeenCalledWith(500)
      expect(json).toHaveBeenCalledWith({
        error: {
          message: 'Internal error.',
          type: 'server_error',
          code: 'internal_error'
        }
      })
    })
  })
})
