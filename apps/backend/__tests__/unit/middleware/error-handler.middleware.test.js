jest.mock('../../../src/logger', () => ({
  __esModule: true,
  default: { error: jest.fn() }
}))

import logger from '../../../src/logger'
import {
  errorHandler,
  notFound
} from '../../../src/middleware/error-handler.middleware'

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
})
