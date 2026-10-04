import type { Response } from 'express'
import { sendApiError } from '../../../src/lib/api-error'

const mockResponse = (): {
  res: Response
  status: jest.Mock
  json: jest.Mock
} => {
  const json = jest.fn()
  const status = jest.fn().mockReturnValue({ json })
  return { res: { status } as unknown as Response, status, json }
}

describe('api-error', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('sendApiError', () => {
    it('should set the status and send the OpenAI error body', () => {
      const { res, status, json } = mockResponse()

      const result = sendApiError(res, 404, 'not_found', 'Unknown route.')

      expect(result).toBeUndefined()
      expect(status).toHaveBeenCalledTimes(1)
      expect(status).toHaveBeenCalledWith(404)
      expect(json).toHaveBeenCalledTimes(1)
      expect(json).toHaveBeenCalledWith({
        error: {
          message: 'Unknown route.',
          type: 'invalid_request_error',
          code: 'not_found'
        }
      })
    })

    it.each([
      [400, 'invalid_request_error'],
      [404, 'invalid_request_error'],
      [413, 'invalid_request_error'],
      [429, 'invalid_request_error'],
      [499, 'invalid_request_error'],
      [500, 'server_error'],
      [502, 'server_error'],
      [503, 'server_error']
    ])(
      'should derive the type from status %i as %s when none is given',
      (code, type) => {
        const { res, status, json } = mockResponse()

        sendApiError(res, code, 'some_code', 'Some message.')

        expect(status).toHaveBeenCalledWith(code)
        expect(json).toHaveBeenCalledWith({
          error: { message: 'Some message.', type, code: 'some_code' }
        })
      }
    )

    it.each([
      [429, 'rate_limit_error'],
      [503, 'invalid_request_error'],
      [400, 'server_error']
    ])(
      'should keep an explicit type over the derived one (status %i, type %s)',
      (code, type) => {
        const { res, status, json } = mockResponse()

        sendApiError(res, code, 'explicit_code', 'Explicit.', type)

        expect(status).toHaveBeenCalledWith(code)
        expect(json).toHaveBeenCalledWith({
          error: { message: 'Explicit.', type, code: 'explicit_code' }
        })
      }
    )
  })
})
