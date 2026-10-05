jest.mock('../../../src/logger', () => ({
  __esModule: true,
  default: { error: jest.fn() }
}))

import logger from '../../../src/logger'
import {
  errorHandler,
  notFound
} from '../../../src/middleware/error-handler.middleware'
import {
  accountLocked,
  AppError,
  forbidden,
  MESSAGES,
  serviceUnavailable,
  unauthorized
} from '../../../src/utils/app-error.utils'

const REQUEST_ID = '4bf92f3577b34da6a3ce929d0e0e4736'
const SERVICE_UNAVAILABLE =
  'Serviço temporariamente indisponível. Tente novamente em instantes.'

const connectionError = (fields = { code: 'ECONNREFUSED' }) =>
  Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:3306'), fields)

describe('error-handler.middleware', () => {
  let res
  let next

  beforeEach(() => {
    jest.clearAllMocks()
    res = {
      headersSent: false,
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    }
    next = jest.fn()
  })

  it('notFound should answer 404 with the message format', () => {
    notFound({}, res)

    expect(res.status).toHaveBeenCalledWith(404)
    expect(res.json).toHaveBeenCalledWith({ message: 'Rota não encontrada.' })
  })

  it('should answer 400 for invalid JSON', () => {
    const error = Object.assign(new SyntaxError('Unexpected token'), {
      type: 'entity.parse.failed'
    })

    errorHandler(error, { id: 'abc' }, res, next)

    expect(res.status).toHaveBeenCalledWith(400)
    expect(res.json).toHaveBeenCalledWith({ message: 'JSON inválido.' })
    expect(next).not.toHaveBeenCalled()
  })

  it('should answer 500 without the stack and log the error with the request id', () => {
    const error = new Error('database exploded')
    const req = { id: 'a'.repeat(32), log: { error: jest.fn() } }

    errorHandler(error, req, res, next)

    expect(res.status).toHaveBeenCalledWith(500)
    expect(res.json).toHaveBeenCalledWith({
      message: 'Erro interno. Tente novamente.'
    })
    expect(JSON.stringify(res.json.mock.calls[0][0])).not.toContain(
      'database exploded'
    )
    expect(req.log.error).toHaveBeenCalledWith(
      { err: error, requestId: req.id },
      'Unhandled error'
    )
    expect(logger.error).not.toHaveBeenCalled()
  })

  it('should fall back to the app logger without a request logger', () => {
    const error = new Error('boom')

    errorHandler(error, { id: 'b'.repeat(32) }, res, next)

    expect(logger.error).toHaveBeenCalledWith(
      { err: error, requestId: 'b'.repeat(32) },
      'Unhandled error'
    )
    expect(res.status).toHaveBeenCalledWith(500)
  })

  it('should delegate to next when the response was already sent', () => {
    const error = new Error('late')
    res.headersSent = true

    errorHandler(error, { id: 'c' }, res, next)

    expect(next).toHaveBeenCalledWith(error)
    expect(res.status).not.toHaveBeenCalled()
  })

  describe('AppError', () => {
    it.each([
      ['unauthorized', unauthorized, 401],
      ['forbidden', forbidden, 403]
    ])(
      'should answer %s with its status and message without logging',
      (_name, build, status) => {
        const error = build()
        const req = { id: REQUEST_ID, log: { error: jest.fn() } }

        errorHandler(error, req, res, next)

        expect(res.status).toHaveBeenCalledWith(status)
        expect(res.json).toHaveBeenCalledWith({ message: error.message })
        expect(req.log.error).not.toHaveBeenCalled()
        expect(logger.error).not.toHaveBeenCalled()
        expect(next).not.toHaveBeenCalled()
      }
    )

    it('should spread the extra fields into the body', () => {
      const error = accountLocked(new Date('2026-10-04T17:50:00Z'), '14:50')

      errorHandler(error, { id: REQUEST_ID }, res, next)

      expect(res.status).toHaveBeenCalledWith(423)
      expect(res.json).toHaveBeenCalledWith({
        message: error.message,
        locked_until: '2026-10-04T17:50:00.000Z'
      })
      expect(logger.error).not.toHaveBeenCalled()
    })

    it('should not log an AppError just below 500', () => {
      errorHandler(new AppError(499, 'client closed'), { id: 'd' }, res, next)

      expect(res.status).toHaveBeenCalledWith(499)
      expect(logger.error).not.toHaveBeenCalled()
    })

    it.each([
      ['500', new AppError(500, 'failure')],
      ['503', serviceUnavailable()]
    ])(
      'should log an AppError of status %s with the request id',
      (status, error) => {
        const req = { id: REQUEST_ID, log: { error: jest.fn() } }

        errorHandler(error, req, res, next)

        expect(res.status).toHaveBeenCalledWith(Number(status))
        expect(res.json).toHaveBeenCalledWith({ message: error.message })
        expect(req.log.error).toHaveBeenCalledWith(
          { err: error, requestId: REQUEST_ID },
          'Request failed'
        )
        expect(logger.error).not.toHaveBeenCalled()
      }
    )

    it('should fall back to the app logger for a server AppError', () => {
      const error = serviceUnavailable()

      errorHandler(error, { id: REQUEST_ID }, res, next)

      expect(logger.error).toHaveBeenCalledWith(
        { err: error, requestId: REQUEST_ID },
        'Request failed'
      )
      expect(res.json).toHaveBeenCalledWith({
        message: MESSAGES.serviceUnavailable
      })
    })
  })

  describe('database unavailable', () => {
    it('should answer 503 when the database is unavailable', () => {
      const error = connectionError()
      const req = { id: REQUEST_ID, log: { error: jest.fn() } }

      errorHandler(error, req, res, next)

      expect(res.status).toHaveBeenCalledWith(503)
      expect(res.json).toHaveBeenCalledWith({ message: SERVICE_UNAVAILABLE })
      expect(JSON.stringify(res.json.mock.calls[0][0])).not.toContain(
        'ECONNREFUSED'
      )
      expect(req.log.error).toHaveBeenCalledWith(
        { err: error, requestId: REQUEST_ID },
        'Database unavailable'
      )
      expect(logger.error).not.toHaveBeenCalled()
    })

    it.each([
      ['the knex pool timeout', { name: 'KnexTimeoutError' }],
      ['a lost connection', { code: 'PROTOCOL_CONNECTION_LOST' }],
      ['a fatal mysql2 error', { fatal: true }]
    ])(
      'should answer 503 for %s and use the app logger without a request logger',
      (_case, fields) => {
        const error = connectionError(fields)

        errorHandler(error, { id: REQUEST_ID }, res, next)

        expect(res.status).toHaveBeenCalledWith(503)
        expect(res.json).toHaveBeenCalledWith({ message: SERVICE_UNAVAILABLE })
        expect(logger.error).toHaveBeenCalledWith(
          { err: error, requestId: REQUEST_ID },
          'Database unavailable'
        )
      }
    )

    it('should keep answering 500 for an ordinary query error', () => {
      const error = connectionError({ code: 'ER_DUP_ENTRY', fatal: false })

      errorHandler(error, { id: REQUEST_ID }, res, next)

      expect(res.status).toHaveBeenCalledWith(500)
      expect(logger.error).toHaveBeenCalledWith(
        { err: error, requestId: REQUEST_ID },
        'Unhandled error'
      )
    })
  })
})
