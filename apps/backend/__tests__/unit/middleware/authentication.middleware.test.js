jest.mock('../../../src/config/env', () => ({
  config: { jwtSecret: 'unit-test-jwt-secret-0123456789abcdef' }
}))
jest.mock('../../../src/models/session.model', () => ({
  __esModule: true,
  default: { findWithIdentity: jest.fn() }
}))
jest.mock('../../../src/api/v2/models/permission.model', () => ({
  __esModule: true,
  default: { findByRole: jest.fn() }
}))

import jwt from 'jsonwebtoken'
import SessionModel from '../../../src/models/session.model'
import PermissionModel from '../../../src/api/v2/models/permission.model'
import { authenticate } from '../../../src/middleware/authentication.middleware'
import { AppError } from '../../../src/utils/app-error.utils'
import { uuidToBin } from '../../../src/utils/uuid.utils'

const JWT_SECRET = 'unit-test-jwt-secret-0123456789abcdef'
const NOW = new Date('2026-10-04T12:00:00.000Z')
const NOW_SECONDS = NOW.getTime() / 1000
const SESSION_END = new Date('2026-10-04T20:00:00.000Z')
const SESSION_ID = '4bf92f35-77b3-4da6-a3ce-929d0e0e4736'
const PLATFORM_USER_ID = '1c6f0a2e-3b4d-4e5f-8a9b-0c1d2e3f4a5b'
const USER_ID = '2d7a1b3f-4c5e-4f60-9b0c-1d2e3f4a5b6c'
const DOMAIN_ID = '3e8b2c4a-5d6f-4071-8c1d-2e3f4a5b6c7d'
const OTHER_ID = '5a1f3c2e-8d4b-4f6a-9b2c-7e1d0f3a6b45'
// Product message defined by the spec, in Portuguese.
const SESSION_EXPIRED = 'Sua sessão expirou. Entre novamente.'

const PLATFORM_USER = { id: PLATFORM_USER_ID, type: 'platform' }
const DOMAIN_USER = { id: USER_ID, type: 'domain', dr_domain_id: DOMAIN_ID }

const sign = (data, { exp = NOW_SECONDS + 3600, secret, algorithm } = {}) =>
  jwt.sign({ data, exp }, secret ?? JWT_SECRET, {
    algorithm: algorithm ?? 'HS256'
  })

const platformSession = overrides => ({
  id: SESSION_ID,
  expiresAt: SESSION_END,
  revokedAt: null,
  identity: {
    type: 'platform',
    id: PLATFORM_USER_ID,
    name: 'Platform Admin',
    email: 'admin@example.com',
    role: 'platform_admin',
    domain: null
  },
  ...overrides
})

const domainSession = (overrides, domainOverrides) => ({
  id: SESSION_ID,
  expiresAt: SESSION_END,
  revokedAt: null,
  identity: {
    type: 'domain',
    id: USER_ID,
    name: 'Domain Admin',
    email: 'domain.admin@example.com',
    role: 'domain_admin',
    domain: {
      id: DOMAIN_ID,
      name: 'Example Domain',
      status: 'active',
      ...domainOverrides
    }
  },
  ...overrides
})

describe('authentication.middleware', () => {
  let req
  let next

  const withHeader = authorization => {
    req = {
      get: jest.fn(name =>
        name.toLowerCase() === 'authorization' ? authorization : undefined
      )
    }
  }

  const withToken = token => withHeader(`Bearer ${token}`)

  const expectUnauthorized = () => {
    expect(next).toHaveBeenCalledTimes(1)
    const [error] = next.mock.calls[0]
    expect(error).toBeInstanceOf(AppError)
    expect(error.status).toBe(401)
    expect(error.message).toBe(SESSION_EXPIRED)
    expect(req.sessionId).toBeUndefined()
    expect(req.currentUser).toBeUndefined()
  }

  beforeEach(() => {
    jest.clearAllMocks()
    // Only Date is faked: jwt.verify and the session expiry read this clock.
    jest.useFakeTimers({
      now: NOW,
      doNotFake: ['nextTick', 'queueMicrotask', 'setImmediate']
    })
    next = jest.fn()
    withHeader(undefined)
    SessionModel.findWithIdentity.mockResolvedValue(platformSession())
    PermissionModel.findByRole.mockResolvedValue(['users.read'])
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  describe('token', () => {
    it.each([
      ['missing', undefined],
      ['empty', ''],
      ['not Bearer', `Basic ${sign({ session_id: SESSION_ID })}`],
      ['Bearer without a token', 'Bearer '],
      ['Bearer with two parts', 'Bearer abc def'],
      ['lower-case bearer', `bearer ${sign({ session_id: SESSION_ID })}`]
    ])(
      'should answer 401 when the Authorization header is %s',
      async (_case, header) => {
        withHeader(header)

        await authenticate(req, {}, next)

        expectUnauthorized()
        expect(SessionModel.findWithIdentity).not.toHaveBeenCalled()
      }
    )

    it.each([
      ['a wrong signature', { secret: 'another-secret-0123456789abcdefghij' }],
      ['an algorithm other than HS256', { algorithm: 'HS512' }],
      ['an expired exp', { exp: NOW_SECONDS - 1 }]
    ])('should answer 401 for a token with %s', async (_case, options) => {
      withToken(sign({ session_id: SESSION_ID, user: PLATFORM_USER }, options))

      await authenticate(req, {}, next)

      expectUnauthorized()
      expect(SessionModel.findWithIdentity).not.toHaveBeenCalled()
    })

    it('should answer 401 for a token that is not a JWT', async () => {
      withToken('not-a-jwt')

      await authenticate(req, {}, next)

      expectUnauthorized()
      expect(SessionModel.findWithIdentity).not.toHaveBeenCalled()
    })

    it.each([
      ['no data', undefined],
      ['no session id', { user: PLATFORM_USER }],
      [
        'a session id in the 32-hex form',
        { session_id: SESSION_ID.replace(/-/g, ''), user: PLATFORM_USER }
      ],
      ['a numeric session id', { session_id: 42, user: PLATFORM_USER }],
      ['no user', { session_id: SESSION_ID }]
    ])('should answer 401 for a payload with %s', async (_case, data) => {
      withToken(sign(data))

      await authenticate(req, {}, next)

      expectUnauthorized()
      expect(SessionModel.findWithIdentity).not.toHaveBeenCalled()
    })
  })

  describe('session', () => {
    it.each([
      ['does not exist', null],
      ['was revoked', platformSession({ revokedAt: new Date(NOW) })],
      [
        'expired',
        platformSession({ expiresAt: new Date('2026-10-04T11:59:59.999Z') })
      ],
      ['ends right now', platformSession({ expiresAt: new Date(NOW) })]
    ])('should answer 401 when the session %s', async (_case, session) => {
      SessionModel.findWithIdentity.mockResolvedValue(session)
      withToken(sign({ session_id: SESSION_ID, user: PLATFORM_USER }))

      await authenticate(req, {}, next)

      expectUnauthorized()
      expect(SessionModel.findWithIdentity).toHaveBeenCalledWith(SESSION_ID)
      expect(PermissionModel.findByRole).not.toHaveBeenCalled()
    })

    it.each([
      [
        'another identity type',
        platformSession(),
        { id: PLATFORM_USER_ID, type: 'domain', dr_domain_id: DOMAIN_ID }
      ],
      [
        'another platform id',
        platformSession(),
        { id: OTHER_ID, type: 'platform' }
      ],
      [
        'another domain user id',
        domainSession(),
        { ...DOMAIN_USER, id: OTHER_ID }
      ],
      [
        'an inactive domain',
        domainSession({}, { status: 'inactive' }),
        DOMAIN_USER
      ],
      [
        'a removed domain',
        domainSession({}, { status: 'removed' }),
        DOMAIN_USER
      ],
      [
        'a domain missing from the copy',
        {
          ...domainSession(),
          identity: { ...domainSession().identity, domain: null }
        },
        DOMAIN_USER
      ],
      [
        'another domain id in the token',
        domainSession(),
        { ...DOMAIN_USER, dr_domain_id: OTHER_ID }
      ]
    ])(
      'should answer 401 for a session of %s',
      async (_case, session, user) => {
        SessionModel.findWithIdentity.mockResolvedValue(session)
        withToken(sign({ session_id: SESSION_ID, user }))

        await authenticate(req, {}, next)

        expectUnauthorized()
        expect(PermissionModel.findByRole).not.toHaveBeenCalled()
      }
    )
  })

  describe('request context', () => {
    it('should fill the request context of the platform admin', async () => {
      withToken(sign({ session_id: SESSION_ID, user: PLATFORM_USER }))

      await authenticate(req, {}, next)

      expect(next).toHaveBeenCalledTimes(1)
      expect(next.mock.calls[0]).toHaveLength(0)
      expect(SessionModel.findWithIdentity).toHaveBeenCalledWith(SESSION_ID)
      expect(PermissionModel.findByRole).toHaveBeenCalledWith('platform_admin')
      expect(req.sessionId).toBe(SESSION_ID)
      expect(req.identityType).toBe('platform')
      expect(req.platformUserId).toBe(PLATFORM_USER_ID)
      expect(req.userId).toBeNull()
      expect(req.role).toBe('platform_admin')
      expect(req.domainId).toBeNull()
      expect(req.domainInBinary).toBeNull()
      expect(req.permissions).toEqual(new Set(['users.read']))
      expect(req.currentUser).toEqual({
        id: PLATFORM_USER_ID,
        name: 'Platform Admin',
        email: 'admin@example.com',
        role: 'platform_admin',
        domain: null
      })
    })

    it('should fill the request context of a domain user', async () => {
      SessionModel.findWithIdentity.mockResolvedValue(domainSession())
      PermissionModel.findByRole.mockResolvedValue([
        'playground.read',
        'users.read'
      ])
      withToken(sign({ session_id: SESSION_ID, user: DOMAIN_USER }))

      await authenticate(req, {}, next)

      expect(next).toHaveBeenCalledTimes(1)
      expect(next.mock.calls[0]).toHaveLength(0)
      expect(PermissionModel.findByRole).toHaveBeenCalledWith('domain_admin')
      expect(req.sessionId).toBe(SESSION_ID)
      expect(req.identityType).toBe('domain')
      expect(req.platformUserId).toBeNull()
      expect(req.userId).toBe(USER_ID)
      expect(req.role).toBe('domain_admin')
      expect(req.domainId).toBe(DOMAIN_ID)
      expect(Buffer.isBuffer(req.domainInBinary)).toBe(true)
      expect(req.domainInBinary.equals(uuidToBin(DOMAIN_ID))).toBe(true)
      expect(req.permissions).toBeInstanceOf(Set)
      expect([...req.permissions]).toEqual(['playground.read', 'users.read'])
      expect(req.currentUser).toEqual({
        id: USER_ID,
        name: 'Domain Admin',
        email: 'domain.admin@example.com',
        role: 'domain_admin',
        domain: { id: DOMAIN_ID, name: 'Example Domain' }
      })
    })

    it('should give an empty permission set to a role without permissions', async () => {
      PermissionModel.findByRole.mockResolvedValue([])
      withToken(sign({ session_id: SESSION_ID, user: PLATFORM_USER }))

      await authenticate(req, {}, next)

      expect(next.mock.calls[0]).toHaveLength(0)
      expect(req.permissions).toEqual(new Set())
    })
  })

  describe('database errors', () => {
    it('should answer 503 when the database is unavailable', async () => {
      // The error handler turns the original database error into the 503.
      const failure = Object.assign(new Error('connect ECONNREFUSED'), {
        code: 'ECONNREFUSED'
      })
      SessionModel.findWithIdentity.mockRejectedValue(failure)
      withToken(sign({ session_id: SESSION_ID, user: PLATFORM_USER }))

      await authenticate(req, {}, next)

      expect(next).toHaveBeenCalledTimes(1)
      expect(next).toHaveBeenCalledWith(failure)
      expect(req.sessionId).toBeUndefined()
    })

    it('should pass a permission query failure to next unchanged', async () => {
      const failure = new Error('Knex: Timeout acquiring a connection')
      PermissionModel.findByRole.mockRejectedValue(failure)
      withToken(sign({ session_id: SESSION_ID, user: PLATFORM_USER }))

      await authenticate(req, {}, next)

      expect(next).toHaveBeenCalledTimes(1)
      expect(next).toHaveBeenCalledWith(failure)
      expect(req.sessionId).toBeUndefined()
    })
  })
})
