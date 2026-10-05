jest.mock('../../../../../database', () => ({ getDb: jest.fn() }))

import db from '../../../../../database'
import UserModel from '../../../../../src/api/v2/models/user.model'
import { uuidToBin } from '../../../../../src/utils/uuid.utils'

const NOW = new Date('2026-10-04T12:00:00.000Z')
const LOCKED_UNTIL = new Date('2026-10-04T12:15:00.000Z')
const USER_ID = '2d7a1b3f-4c5e-4f60-9b0c-1d2e3f4a5b6c'
const DOMAIN_ID = '3e8b2c4a-5d6f-4071-8c1d-2e3f4a5b6c7d'
const EMAIL = 'user@example.com'
const PASSWORD_HASH =
  '$2b$10$abcdefghijklmnopqrstuuVwxyzABCDEFGHIJKLMNOPQRSTUVWX'
const COLUMNS = [
  'id',
  'dr_domain_id',
  'name',
  'email',
  'password_hash',
  'role',
  'failed_attempts',
  'locked_until'
]

// A new builder per knex call; `then` is bound to a real promise (rule PA3).
const createMockQueryBuilder = ({ result = [], row } = {}) => {
  const qb = {
    select: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    forUpdate: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    first: jest.fn().mockResolvedValue(row)
  }
  const promise = Promise.resolve(result)
  qb.then = promise.then.bind(promise)
  qb.catch = promise.catch.bind(promise)
  return qb
}

const accountRow = () => ({
  id: uuidToBin(USER_ID),
  dr_domain_id: uuidToBin(DOMAIN_ID),
  name: 'Domain User',
  email: EMAIL,
  password_hash: PASSWORD_HASH,
  role: 'user',
  failed_attempts: 4,
  locked_until: LOCKED_UNTIL
})

const expectedAccount = {
  id: USER_ID,
  domainId: DOMAIN_ID,
  name: 'Domain User',
  email: EMAIL,
  passwordHash: PASSWORD_HASH,
  role: 'user',
  failedAttempts: 4,
  lockedUntil: LOCKED_UNTIL
}

describe('user.model', () => {
  let builders

  // Each call returns a new knex-like function that builds a new builder.
  const createKnex = options =>
    jest.fn(() => {
      const qb = createMockQueryBuilder(options)
      builders.push(qb)
      return qb
    })

  const useDb = options => {
    db.getDb.mockImplementation(() => createKnex(options))
  }

  beforeEach(() => {
    jest.clearAllMocks()
    jest.useFakeTimers({ now: NOW })
    builders = []
    useDb()
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  describe('findByEmail', () => {
    it('should return the mapped account with its domain id', async () => {
      useDb({ row: accountRow() })

      const account = await UserModel.findByEmail(EMAIL)

      expect(account).toEqual(expectedAccount)
      expect(db.getDb).toHaveBeenCalledWith({ operation: 'read' })
      expect(db.getDb.mock.results[0].value).toHaveBeenCalledWith('users')
      expect(builders[0].select).toHaveBeenCalledWith(COLUMNS)
      expect(builders[0].where).toHaveBeenCalledWith('email', EMAIL)
      expect(builders[0].first).toHaveBeenCalledTimes(1)
    })

    it('should return null when no user has the e-mail', async () => {
      useDb({ row: undefined })

      await expect(UserModel.findByEmail(EMAIL)).resolves.toBeNull()
    })

    it('should read through the given transaction', async () => {
      const trx = createKnex({ row: accountRow() })

      await expect(UserModel.findByEmail(EMAIL, trx)).resolves.toEqual(
        expectedAccount
      )
      expect(db.getDb).not.toHaveBeenCalled()
      expect(trx).toHaveBeenCalledWith('users')
    })
  })

  describe('findByEmailForUpdate', () => {
    it('should lock the row with FOR UPDATE inside the given transaction', async () => {
      const trx = createKnex({ row: accountRow() })

      const account = await UserModel.findByEmailForUpdate(EMAIL, trx)

      expect(account).toEqual(expectedAccount)
      expect(db.getDb).not.toHaveBeenCalled()
      expect(trx).toHaveBeenCalledWith('users')
      const qb = builders[0]
      expect(qb.select).toHaveBeenCalledWith(COLUMNS)
      expect(qb.where).toHaveBeenCalledWith('email', EMAIL)
      expect(qb.forUpdate).toHaveBeenCalledTimes(1)
      expect(qb.first).toHaveBeenCalledTimes(1)
    })

    it('should return null when no user has the e-mail', async () => {
      const trx = createKnex({ row: undefined })

      await expect(
        UserModel.findByEmailForUpdate(EMAIL, trx)
      ).resolves.toBeNull()
    })
  })

  describe('emailExists', () => {
    it.each([
      ['true when the e-mail is taken', { id: uuidToBin(USER_ID) }, true],
      ['false when the e-mail is free', undefined, false]
    ])('should return %s', async (_case, row, expected) => {
      useDb({ row })

      await expect(UserModel.emailExists(EMAIL)).resolves.toBe(expected)
      expect(db.getDb).toHaveBeenCalledWith({ operation: 'read' })
      expect(builders[0].select).toHaveBeenCalledWith('id')
      expect(builders[0].where).toHaveBeenCalledWith('email', EMAIL)
    })

    it('should read through the given transaction', async () => {
      const trx = createKnex({ row: undefined })

      await expect(UserModel.emailExists(EMAIL, trx)).resolves.toBe(false)
      expect(db.getDb).not.toHaveBeenCalled()
      expect(trx).toHaveBeenCalledWith('users')
    })
  })

  describe('registerFailure', () => {
    it('should store the failure counter, the lock and updated_at', async () => {
      useDb({ result: 1 })

      const count = await UserModel.registerFailure(USER_ID, {
        failedAttempts: 0,
        lockedUntil: LOCKED_UNTIL
      })

      expect(count).toBe(1)
      expect(db.getDb).toHaveBeenCalledWith({ operation: 'write' })
      expect(builders[0].where).toHaveBeenCalledWith('id', uuidToBin(USER_ID))
      expect(builders[0].update).toHaveBeenCalledWith({
        failed_attempts: 0,
        locked_until: LOCKED_UNTIL,
        updated_at: NOW
      })
    })

    it('should update through the given transaction', async () => {
      const trx = createKnex({ result: 1 })

      await UserModel.registerFailure(
        USER_ID,
        { failedAttempts: 2, lockedUntil: null },
        trx
      )

      expect(db.getDb).not.toHaveBeenCalled()
      expect(trx).toHaveBeenCalledWith('users')
      expect(builders[0].update).toHaveBeenCalledWith({
        failed_attempts: 2,
        locked_until: null,
        updated_at: NOW
      })
    })
  })

  describe('registerSuccess', () => {
    it('should reset the counter and the lock and set last_login_at', async () => {
      useDb({ result: 1 })

      const count = await UserModel.registerSuccess(USER_ID)

      expect(count).toBe(1)
      expect(db.getDb).toHaveBeenCalledWith({ operation: 'write' })
      expect(builders[0].where).toHaveBeenCalledWith('id', uuidToBin(USER_ID))
      expect(builders[0].update).toHaveBeenCalledWith({
        failed_attempts: 0,
        locked_until: null,
        last_login_at: NOW,
        updated_at: NOW
      })
    })

    it('should update through the given transaction', async () => {
      const trx = createKnex({ result: 1 })

      await UserModel.registerSuccess(USER_ID, trx)

      expect(db.getDb).not.toHaveBeenCalled()
      expect(trx).toHaveBeenCalledWith('users')
      expect(builders[0].update).toHaveBeenCalledTimes(1)
    })
  })

  describe('resetFailures', () => {
    it('should reset the counter and the lock without touching last_login_at', async () => {
      useDb({ result: 1 })

      const count = await UserModel.resetFailures(USER_ID)

      expect(count).toBe(1)
      expect(db.getDb).toHaveBeenCalledWith({ operation: 'write' })
      expect(db.getDb.mock.results[0].value).toHaveBeenCalledWith('users')
      expect(builders[0].where).toHaveBeenCalledWith('id', uuidToBin(USER_ID))
      expect(builders[0].update).toHaveBeenCalledWith({
        failed_attempts: 0,
        locked_until: null,
        updated_at: NOW
      })
    })

    it('should update through the given transaction', async () => {
      const trx = createKnex({ result: 1 })

      await UserModel.resetFailures(USER_ID, trx)

      expect(db.getDb).not.toHaveBeenCalled()
      expect(trx).toHaveBeenCalledWith('users')
      expect(builders[0].update).toHaveBeenCalledTimes(1)
    })
  })
})
