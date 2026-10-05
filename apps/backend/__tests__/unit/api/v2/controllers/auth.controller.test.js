jest.mock('../../../../../src/services/auth.service', () => ({
  login: jest.fn(),
  logout: jest.fn()
}))

import * as authService from '../../../../../src/services/auth.service'
import {
  login,
  logout
} from '../../../../../src/api/v2/controllers/auth.controller'
import { AppError } from '../../../../../src/utils/app-error.utils'

const EMAIL = 'admin@example.com'
const PASSWORD = 'right-password-123'
const IP_ADDRESS = '203.0.113.10'
const USER_AGENT = 'unit-test-agent'
const SESSION_ID = '4bf92f35-77b3-4da6-a3ce-929d0e0e4736'
const SESSION = {
  token: 'signed.jwt.token',
  expires_at: '2026-10-04T20:00:00.000Z'
}
// Product message defined by the spec, in Portuguese.
const BAD_LOGIN_REQUEST = 'Informe o e-mail e a senha.'

describe('auth.controller', () => {
  let req
  let res
  let next

  const buildReq = (body, headers = {}) => ({
    body,
    ip: IP_ADDRESS,
    get: jest.fn(name => headers[name.toLowerCase()])
  })

  beforeEach(() => {
    jest.clearAllMocks()
    req = buildReq(
      { email: EMAIL, password: PASSWORD },
      {
        'user-agent': USER_AGENT
      }
    )
    res = {
      set: jest.fn().mockReturnThis(),
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
      end: jest.fn()
    }
    next = jest.fn()
    authService.login.mockResolvedValue(SESSION)
    authService.logout.mockResolvedValue(1)
  })

  describe('login', () => {
    it.each([
      ['no body', undefined],
      ['an empty object', {}],
      ['no e-mail', { password: PASSWORD }],
      ['no password', { email: EMAIL }],
      ['a numeric e-mail', { email: 42, password: PASSWORD }],
      ['a numeric password', { email: EMAIL, password: 12345678901 }],
      ['a null e-mail', { email: null, password: PASSWORD }],
      ['an empty e-mail', { email: '', password: PASSWORD }],
      ['an e-mail with only spaces', { email: '   ', password: PASSWORD }],
      ['an empty password', { email: EMAIL, password: '' }],
      [
        'an e-mail over 254 characters',
        { email: `${'a'.repeat(243)}@example.com`, password: PASSWORD }
      ]
    ])('should answer 400 for a body with %s', async (_case, body) => {
      req.body = body

      await login(req, res, next)

      expect(next).toHaveBeenCalledTimes(1)
      const [error] = next.mock.calls[0]
      expect(error).toBeInstanceOf(AppError)
      expect(error.status).toBe(400)
      expect(error.message).toBe(BAD_LOGIN_REQUEST)
      expect(authService.login).not.toHaveBeenCalled()
      expect(res.status).not.toHaveBeenCalled()
    })

    it('should pass the trimmed e-mail, the password, the IP and the user agent to the service', async () => {
      req.body = { email: '  Admin@Example.com  ', password: ` ${PASSWORD} ` }

      await login(req, res, next)

      expect(authService.login).toHaveBeenCalledWith({
        email: 'Admin@Example.com',
        password: ` ${PASSWORD} `,
        ipAddress: IP_ADDRESS,
        userAgent: USER_AGENT
      })
      expect(req.get).toHaveBeenCalledWith('user-agent')
    })

    it('should accept an e-mail of exactly 254 characters after the trim', async () => {
      const email = `${'a'.repeat(242)}@example.com`
      req.body = { email: `  ${email}  `, password: PASSWORD }

      await login(req, res, next)

      expect(email).toHaveLength(254)
      expect(authService.login).toHaveBeenCalledWith(
        expect.objectContaining({ email })
      )
      expect(next).not.toHaveBeenCalled()
    })

    it('should pass an undefined user agent when the header is missing', async () => {
      req = buildReq({ email: EMAIL, password: PASSWORD })

      await login(req, res, next)

      expect(authService.login).toHaveBeenCalledWith({
        email: EMAIL,
        password: PASSWORD,
        ipAddress: IP_ADDRESS,
        userAgent: undefined
      })
    })

    it('should answer 200 with the session and Cache-Control no-store', async () => {
      await login(req, res, next)

      expect(res.set).toHaveBeenCalledWith('Cache-Control', 'no-store')
      expect(res.status).toHaveBeenCalledWith(200)
      expect(res.json).toHaveBeenCalledWith(SESSION)
      expect(next).not.toHaveBeenCalled()
    })

    it('should pass a service error to next unchanged', async () => {
      const failure = new AppError(401, 'invalid credentials')
      authService.login.mockRejectedValue(failure)

      await login(req, res, next)

      expect(next).toHaveBeenCalledWith(failure)
      expect(res.status).not.toHaveBeenCalled()
      expect(res.json).not.toHaveBeenCalled()
    })
  })

  describe('logout', () => {
    it('should revoke the session of the request and answer 204 without a body', async () => {
      req.sessionId = SESSION_ID

      await logout(req, res, next)

      expect(authService.logout).toHaveBeenCalledWith(SESSION_ID)
      expect(res.status).toHaveBeenCalledWith(204)
      expect(res.end).toHaveBeenCalledTimes(1)
      expect(res.json).not.toHaveBeenCalled()
      expect(next).not.toHaveBeenCalled()
    })

    it('should pass a service error to next unchanged', async () => {
      const failure = new Error('connect ECONNREFUSED')
      authService.logout.mockRejectedValue(failure)
      req.sessionId = SESSION_ID

      await logout(req, res, next)

      expect(next).toHaveBeenCalledWith(failure)
      expect(res.status).not.toHaveBeenCalled()
      expect(res.end).not.toHaveBeenCalled()
    })
  })
})
