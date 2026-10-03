import type { Response } from 'express'
import { apiError, errorType, sendApiError } from '../../../src/lib/api-error'

describe('api-error', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it.each([
    [400, 'invalid_request_error'],
    [401, 'authentication_error'],
    [404, 'invalid_request_error'],
    [500, 'server_error'],
    [429, 'invalid_request_error'],
    [503, 'server_error']
  ])('errorType(%i) should be %s', (status, type) => {
    expect(errorType(status)).toBe(type)
  })

  it('apiError should build the OpenAI-compatible error body', () => {
    expect(apiError(401, 'invalid_admin_key', 'Chave inválida.')).toEqual({
      error: {
        message: 'Chave inválida.',
        type: 'authentication_error',
        code: 'invalid_admin_key'
      }
    })
  })

  it('sendApiError should set the status and send the body', () => {
    const json = jest.fn()
    const status = jest.fn().mockReturnValue({ json })

    sendApiError({ status } as unknown as Response, 404, 'not_found', 'Nada.')

    expect(status).toHaveBeenCalledWith(404)
    expect(json).toHaveBeenCalledWith({
      error: {
        message: 'Nada.',
        type: 'invalid_request_error',
        code: 'not_found'
      }
    })
  })
})
