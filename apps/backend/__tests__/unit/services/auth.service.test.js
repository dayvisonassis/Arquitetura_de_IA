jest.mock('bcrypt', () => ({ hash: jest.fn(), compare: jest.fn() }))
jest.mock('../../../database', () => ({ getDb: jest.fn() }))
jest.mock('../../../src/config/env', () => ({
  config: { jwtSecret: 'unit-test-jwt-secret-0123456789abcdef' }
}))
jest.mock('../../../src/api/v2/models/domain.model', () => ({
  __esModule: true,
  default: { findById: jest.fn() }
}))
jest.mock('../../../src/api/v2/models/user.model', () => ({
  __esModule: true,
  default: {
    findByEmailForUpdate: jest.fn(),
    registerFailure: jest.fn(),
    registerSuccess: jest.fn(),
    resetFailures: jest.fn()
  }
}))
jest.mock('../../../src/models/platform-user.model', () => ({
  __esModule: true,
  default: {
    findByEmailForUpdate: jest.fn(),
    registerFailure: jest.fn(),
    registerSuccess: jest.fn()
  }
}))
jest.mock('../../../src/models/session.model', () => ({
  __esModule: true,
  default: { create: jest.fn(), revoke: jest.fn() }
}))

import bcrypt from 'bcrypt'
import jwt from 'jsonwebtoken'
import db from '../../../database'
import DomainModel from '../../../src/api/v2/models/domain.model'
import UserModel from '../../../src/api/v2/models/user.model'
import PlatformUserModel from '../../../src/models/platform-user.model'
import SessionModel from '../../../src/models/session.model'
import { AppError } from '../../../src/utils/app-error.utils'
import { login, logout } from '../../../src/services/auth.service'

const JWT_SECRET = 'unit-test-jwt-secret-0123456789abcdef'
// Milliseconds on purpose: the session end must be truncated to the second.
const NOW = new Date('2026-10-04T12:00:00.789Z')
const EXPIRES_AT_ISO = '2026-10-04T20:00:00.000Z'
const LOCKED_UNTIL_ISO = '2026-10-04T12:15:00.789Z'
const RAW_EMAIL = '  Admin@Example.COM '
const NORMALIZED = 'admin@example.com'
const PASSWORD = 'right-password-123'
const WRONG_PASSWORD = 'wrong-password-123'
const ACCOUNT_HASH =
  '$2b$10$accounthashforunittestsonly000000000000000000000000'
const PLACEHOLDER_HASH =
  '$2b$10$placeholderhashforunittestsonly0000000000000000000000'
const PLACEHOLDER_PASSWORD = 'placeholder-password-for-timing'
const PLATFORM_USER_ID = '1c6f0a2e-3b4d-4e5f-8a9b-0c1d2e3f4a5b'
const USER_ID = '2d7a1b3f-4c5e-4f60-9b0c-1d2e3f4a5b6c'
const DOMAIN_ID = '3e8b2c4a-5d6f-4071-8c1d-2e3f4a5b6c7d'
const SESSION_ID = '4bf92f35-77b3-4da6-a3ce-929d0e0e4736'
const IP_ADDRESS = '203.0.113.10'
const USER_AGENT = 'unit-test-agent'
// Product messages defined by the spec, in Portuguese.
const INVALID_CREDENTIALS = 'E-mail ou senha inválidos.'
const DOMAIN_INACTIVE =
  'O domínio da sua conta está desativado. Fale com o administrador da plataforma.'

const platformAccount = overrides => ({
  id: PLATFORM_USER_ID,
  name: 'Platform Admin',
  email: NORMALIZED,
  passwordHash: ACCOUNT_HASH,
  role: 'platform_admin',
  failedAttempts: 0,
  lockedUntil: null,
  ...overrides
})

const domainAccount = overrides => ({
  id: USER_ID,
  domainId: DOMAIN_ID,
  name: 'Domain User',
  email: NORMALIZED,
  passwordHash: ACCOUNT_HASH,
  role: 'user',
  failedAttempts: 0,
  lockedUntil: null,
  ...overrides
})

const credentials = overrides => ({
  email: RAW_EMAIL,
  password: PASSWORD,
  ipAddress: IP_ADDRESS,
  userAgent: USER_AGENT,
  ...overrides
})

const loginError = async input => {
  try {
    await login(input)
  } catch (error) {
    return error
  }
  throw new Error('login should have failed')
}

describe('auth.service', () => {
  let trx
  let transaction

  const usePlatformAccount = overrides => {
    PlatformUserModel.findByEmailForUpdate.mockResolvedValue(
      platformAccount(overrides)
    )
  }

  const useDomainAccount = (overrides, domain = { status: 'active' }) => {
    UserModel.findByEmailForUpdate.mockResolvedValue(domainAccount(overrides))
    DomainModel.findById.mockResolvedValue(
      domain && { id: DOMAIN_ID, name: 'Example Domain', ...domain }
    )
  }

  const passwordMatches = matches => {
    bcrypt.compare.mockImplementation((password, hash) =>
      Promise.resolve(matches && hash === ACCOUNT_HASH)
    )
  }

  beforeEach(() => {
    jest.clearAllMocks()
    // Only Date is faked, so the mocked promises keep resolving normally.
    jest.useFakeTimers({
      now: NOW,
      doNotFake: ['nextTick', 'queueMicrotask', 'setImmediate']
    })
    trx = { name: 'transaction' }
    transaction = jest.fn(callback => callback(trx))
    db.getDb.mockReturnValue({ transaction })
    bcrypt.hash.mockResolvedValue(PLACEHOLDER_HASH)
    passwordMatches(true)
    PlatformUserModel.findByEmailForUpdate.mockResolvedValue(null)
    UserModel.findByEmailForUpdate.mockResolvedValue(null)
    DomainModel.findById.mockResolvedValue(null)
    PlatformUserModel.registerFailure.mockResolvedValue(1)
    PlatformUserModel.registerSuccess.mockResolvedValue(1)
    UserModel.registerFailure.mockResolvedValue(1)
    UserModel.registerSuccess.mockResolvedValue(1)
    UserModel.resetFailures.mockResolvedValue(1)
    SessionModel.create.mockResolvedValue(SESSION_ID)
    SessionModel.revoke.mockResolvedValue(1)
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  describe('login - account lookup', () => {
    it('should answer 401 for an unknown e-mail after comparing with the placeholder hash', async () => {
      const error = await loginError(credentials())

      expect(error).toBeInstanceOf(AppError)
      expect(error.status).toBe(401)
      expect(error.message).toBe(INVALID_CREDENTIALS)
      expect(bcrypt.compare).toHaveBeenCalledTimes(1)
      expect(bcrypt.compare).toHaveBeenCalledWith(PASSWORD, PLACEHOLDER_HASH)
      expect(PlatformUserModel.registerFailure).not.toHaveBeenCalled()
      expect(UserModel.registerFailure).not.toHaveBeenCalled()
      expect(SessionModel.create).not.toHaveBeenCalled()
    })

    it('should answer 401 with the same body for unknown e-mail and wrong password', async () => {
      const unknown = await loginError(credentials())
      usePlatformAccount()
      passwordMatches(false)

      const wrong = await loginError(credentials({ password: WRONG_PASSWORD }))

      const body = error => ({
        status: error.status,
        message: error.message,
        extra: error.extra
      })
      expect(body(unknown)).toEqual(body(wrong))
      expect(body(wrong)).toEqual({
        status: 401,
        message: INVALID_CREDENTIALS,
        extra: {}
      })
      expect(bcrypt.compare).toHaveBeenNthCalledWith(
        1,
        PASSWORD,
        PLACEHOLDER_HASH
      )
      expect(bcrypt.compare).toHaveBeenNthCalledWith(
        2,
        WRONG_PASSWORD,
        ACCOUNT_HASH
      )
    })

    it('should open a write transaction and look up the platform admin first with the normalized e-mail', async () => {
      usePlatformAccount()
      useDomainAccount()

      await login(credentials())

      expect(db.getDb).toHaveBeenCalledWith({ operation: 'write' })
      expect(transaction).toHaveBeenCalledTimes(1)
      expect(PlatformUserModel.findByEmailForUpdate).toHaveBeenCalledWith(
        NORMALIZED,
        trx
      )
      expect(UserModel.findByEmailForUpdate).not.toHaveBeenCalled()
      expect(PlatformUserModel.registerSuccess).toHaveBeenCalledWith(
        PLATFORM_USER_ID,
        trx
      )
    })

    it('should fall back to the domain users when no platform admin has the e-mail', async () => {
      useDomainAccount()

      await login(credentials())

      expect(PlatformUserModel.findByEmailForUpdate).toHaveBeenCalledWith(
        NORMALIZED,
        trx
      )
      expect(UserModel.findByEmailForUpdate).toHaveBeenCalledWith(
        NORMALIZED,
        trx
      )
      expect(DomainModel.findById).toHaveBeenCalledWith(DOMAIN_ID, trx)
      expect(UserModel.registerSuccess).toHaveBeenCalledWith(USER_ID, trx)
    })

    it('should compute the placeholder hash only once', async () => {
      await jest.isolateModulesAsync(async () => {
        // A fresh module registry gives the service an empty hash cache.
        const isolatedBcrypt = require('bcrypt')
        const isolatedDb = require('../../../database')
        const isolatedPlatform =
          require('../../../src/models/platform-user.model').default
        const isolatedUser =
          require('../../../src/api/v2/models/user.model').default
        isolatedDb.getDb.mockReturnValue({ transaction })
        isolatedPlatform.findByEmailForUpdate.mockResolvedValue(null)
        isolatedUser.findByEmailForUpdate.mockResolvedValue(null)
        isolatedBcrypt.hash.mockResolvedValue(PLACEHOLDER_HASH)
        isolatedBcrypt.compare.mockResolvedValue(false)
        const isolated = require('../../../src/services/auth.service')

        await expect(isolated.login(credentials())).rejects.toThrow(
          INVALID_CREDENTIALS
        )
        await expect(isolated.login(credentials())).rejects.toThrow(
          INVALID_CREDENTIALS
        )

        expect(isolatedBcrypt.hash).toHaveBeenCalledTimes(1)
        expect(isolatedBcrypt.hash).toHaveBeenCalledWith(
          PLACEHOLDER_PASSWORD,
          10
        )
        expect(isolatedBcrypt.compare).toHaveBeenCalledTimes(2)
        expect(isolatedBcrypt.compare).toHaveBeenLastCalledWith(
          PASSWORD,
          PLACEHOLDER_HASH
        )
      })
    })
  })

  describe('login - lock', () => {
    it('should refuse the right password while the account is locked', async () => {
      const lockedUntil = new Date('2026-10-04T12:10:00.000Z')
      usePlatformAccount({ lockedUntil, failedAttempts: 0 })

      const error = await loginError(credentials())

      expect(error).toBeInstanceOf(AppError)
      expect(error.status).toBe(423)
      expect(error.message).toBe(
        'Conta bloqueada por 15 minutos após várias tentativas. Tente novamente às 09:10.'
      )
      expect(error.extra).toEqual({ locked_until: lockedUntil.toISOString() })
      expect(bcrypt.compare).not.toHaveBeenCalled()
      expect(PlatformUserModel.registerFailure).not.toHaveBeenCalled()
      expect(PlatformUserModel.registerSuccess).not.toHaveBeenCalled()
      expect(SessionModel.create).not.toHaveBeenCalled()
    })

    it.each([
      ['in the past', new Date('2026-10-04T11:59:59.000Z')],
      ['equal to now', new Date(NOW)]
    ])(
      'should compare the password when locked_until is %s',
      async (_case, lockedUntil) => {
        usePlatformAccount({ lockedUntil, failedAttempts: 4 })

        const result = await login(credentials())

        expect(result.expires_at).toBe(EXPIRES_AT_ISO)
        expect(bcrypt.compare).toHaveBeenCalledWith(PASSWORD, ACCOUNT_HASH)
        expect(PlatformUserModel.registerSuccess).toHaveBeenCalledTimes(1)
      }
    )

    it.each([
      [
        'platform admin',
        usePlatformAccount,
        PlatformUserModel,
        UserModel,
        PLATFORM_USER_ID
      ],
      ['domain user', useDomainAccount, UserModel, PlatformUserModel, USER_ID]
    ])(
      'should lock the account on the fifth consecutive failure (%s)',
      async (_identity, useAccount, model, otherModel, id) => {
        useAccount({ failedAttempts: 4 })
        passwordMatches(false)

        const error = await loginError(
          credentials({ password: WRONG_PASSWORD })
        )

        expect(error).toBeInstanceOf(AppError)
        expect(error.status).toBe(423)
        expect(error.message).toBe(
          'Conta bloqueada por 15 minutos após várias tentativas. Tente novamente às 09:15.'
        )
        expect(error.extra).toEqual({ locked_until: LOCKED_UNTIL_ISO })
        expect(model.registerFailure).toHaveBeenCalledTimes(1)
        expect(model.registerFailure).toHaveBeenCalledWith(
          id,
          { failedAttempts: 0, lockedUntil: new Date(LOCKED_UNTIL_ISO) },
          trx
        )
        expect(otherModel.registerFailure).not.toHaveBeenCalled()
        expect(model.registerSuccess).not.toHaveBeenCalled()
        expect(SessionModel.create).not.toHaveBeenCalled()
      }
    )

    it('should lock the account when the stored counter is already above the limit', async () => {
      usePlatformAccount({ failedAttempts: 7 })
      passwordMatches(false)

      const error = await loginError(credentials({ password: WRONG_PASSWORD }))

      expect(error.status).toBe(423)
      expect(PlatformUserModel.registerFailure).toHaveBeenCalledWith(
        PLATFORM_USER_ID,
        { failedAttempts: 0, lockedUntil: new Date(LOCKED_UNTIL_ISO) },
        trx
      )
    })
  })

  describe('login - wrong password', () => {
    it.each([
      [
        'platform admin',
        usePlatformAccount,
        PlatformUserModel,
        PLATFORM_USER_ID
      ],
      ['domain user', useDomainAccount, UserModel, USER_ID]
    ])(
      'should add one to the counter and answer 401 for a wrong password (%s)',
      async (_identity, useAccount, model, id) => {
        useAccount({ failedAttempts: 3 })
        passwordMatches(false)

        const error = await loginError(
          credentials({ password: WRONG_PASSWORD })
        )

        expect(error).toBeInstanceOf(AppError)
        expect(error.status).toBe(401)
        expect(error.message).toBe(INVALID_CREDENTIALS)
        expect(model.registerFailure).toHaveBeenCalledWith(
          id,
          { failedAttempts: 4, lockedUntil: null },
          trx
        )
        expect(model.registerSuccess).not.toHaveBeenCalled()
        expect(DomainModel.findById).not.toHaveBeenCalled()
        expect(SessionModel.create).not.toHaveBeenCalled()
      }
    )

    it.each([
      ['shorter than 10 characters', 'short'],
      ['over 64 characters', 'a'.repeat(65)],
      ['over 72 bytes with 64 characters or less', 'ç'.repeat(40)]
    ])(
      'should compare a password %s with the placeholder hash and count it as a failure',
      async (_case, password) => {
        // Even a matching hash must not let an out-of-rules password in.
        bcrypt.compare.mockResolvedValue(true)
        usePlatformAccount({ failedAttempts: 0 })

        const error = await loginError(credentials({ password }))

        expect(error.status).toBe(401)
        expect(error.message).toBe(INVALID_CREDENTIALS)
        expect(bcrypt.compare).toHaveBeenCalledTimes(1)
        expect(bcrypt.compare).toHaveBeenCalledWith(password, PLACEHOLDER_HASH)
        expect(bcrypt.compare).not.toHaveBeenCalledWith(
          expect.anything(),
          ACCOUNT_HASH
        )
        expect(PlatformUserModel.registerFailure).toHaveBeenCalledWith(
          PLATFORM_USER_ID,
          { failedAttempts: 1, lockedUntil: null },
          trx
        )
        expect(SessionModel.create).not.toHaveBeenCalled()
      }
    )

    it('should resolve the transaction with the error so the counter update commits', async () => {
      usePlatformAccount({ failedAttempts: 1 })
      passwordMatches(false)

      const error = await loginError(credentials({ password: WRONG_PASSWORD }))

      // The transaction callback resolved (commit), and only then did login throw.
      const outcome = await transaction.mock.results[0].value
      expect(outcome).toEqual({ error })
      expect(error.status).toBe(401)
      expect(PlatformUserModel.registerFailure).toHaveBeenCalledTimes(1)
    })
  })

  describe('login - domain status', () => {
    it.each([
      ['inactive', { status: 'inactive' }],
      ['removed', { status: 'removed' }],
      ['missing from the copy', null]
    ])(
      'should refuse a user of an inactive or removed domain (%s)',
      async (_case, domain) => {
        useDomainAccount({ failedAttempts: 2 }, domain)

        const error = await loginError(credentials())

        expect(error).toBeInstanceOf(AppError)
        expect(error.status).toBe(403)
        expect(error.message).toBe(DOMAIN_INACTIVE)
        expect(DomainModel.findById).toHaveBeenCalledWith(DOMAIN_ID, trx)
        expect(UserModel.resetFailures).toHaveBeenCalledWith(USER_ID, trx)
        expect(UserModel.registerFailure).not.toHaveBeenCalled()
        expect(UserModel.registerSuccess).not.toHaveBeenCalled()
        expect(SessionModel.create).not.toHaveBeenCalled()
      }
    )

    it('should not read any domain for the platform admin', async () => {
      usePlatformAccount()

      await login(credentials())

      expect(DomainModel.findById).not.toHaveBeenCalled()
      expect(UserModel.resetFailures).not.toHaveBeenCalled()
    })
  })

  describe('login - success', () => {
    it('should create a platform session and sign a token that ends with it', async () => {
      usePlatformAccount()

      const result = await login(credentials())

      expect(SessionModel.create).toHaveBeenCalledWith(
        {
          platformUserId: PLATFORM_USER_ID,
          userId: null,
          expiresAt: new Date(EXPIRES_AT_ISO),
          ipAddress: IP_ADDRESS,
          userAgent: USER_AGENT
        },
        trx
      )
      expect(result).toEqual({
        token: expect.any(String),
        expires_at: EXPIRES_AT_ISO
      })
      const { header, payload } = jwt.decode(result.token, { complete: true })
      expect(header.alg).toBe('HS256')
      expect(payload.data).toEqual({
        session_id: SESSION_ID,
        user: { id: PLATFORM_USER_ID, type: 'platform' }
      })
      expect(payload.data.user).not.toHaveProperty('dr_domain_id')
      expect(payload.exp).toBe(new Date(EXPIRES_AT_ISO).getTime() / 1000)
      expect(payload.iat).toBe(Math.floor(NOW.getTime() / 1000))
      expect(() =>
        jwt.verify(result.token, JWT_SECRET, { algorithms: ['HS256'] })
      ).not.toThrow()
    })

    it('should create a domain session and put dr_domain_id in the token', async () => {
      useDomainAccount()

      const result = await login(credentials())

      expect(SessionModel.create).toHaveBeenCalledWith(
        {
          platformUserId: null,
          userId: USER_ID,
          expiresAt: new Date(EXPIRES_AT_ISO),
          ipAddress: IP_ADDRESS,
          userAgent: USER_AGENT
        },
        trx
      )
      const payload = jwt.verify(result.token, JWT_SECRET, {
        algorithms: ['HS256']
      })
      expect(payload.data).toEqual({
        session_id: SESSION_ID,
        user: { id: USER_ID, type: 'domain', dr_domain_id: DOMAIN_ID }
      })
      expect(payload.exp).toBe(new Date(EXPIRES_AT_ISO).getTime() / 1000)
      expect(result.expires_at).toBe(EXPIRES_AT_ISO)
    })

    it('should reset the counter on a successful login', async () => {
      useDomainAccount({ failedAttempts: 4 })

      await login(credentials())

      expect(UserModel.registerSuccess).toHaveBeenCalledWith(USER_ID, trx)
      expect(UserModel.registerFailure).not.toHaveBeenCalled()
      expect(UserModel.resetFailures).not.toHaveBeenCalled()
      expect(bcrypt.compare).toHaveBeenCalledWith(PASSWORD, ACCOUNT_HASH)
    })

    it('should reject with the database error when the session cannot be created', async () => {
      const failure = new Error('connect ECONNREFUSED')
      usePlatformAccount()
      SessionModel.create.mockRejectedValue(failure)

      await expect(login(credentials())).rejects.toBe(failure)
    })
  })

  describe('logout', () => {
    it('should revoke the session with the reason logout', async () => {
      const result = await logout(SESSION_ID)

      expect(result).toBe(1)
      expect(SessionModel.revoke).toHaveBeenCalledTimes(1)
      expect(SessionModel.revoke).toHaveBeenCalledWith(SESSION_ID, 'logout')
    })
  })
})
