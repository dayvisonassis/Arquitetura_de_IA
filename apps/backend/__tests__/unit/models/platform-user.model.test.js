jest.mock('../../../database', () => ({ getDb: jest.fn() }))

import db from '../../../database'
import PlatformUserModel from '../../../src/models/platform-user.model'
import { uuidToBin } from '../../../src/utils/uuid.utils'

const NOW = new Date('2026-10-04T12:00:00.000Z')
const LOCKED_UNTIL = new Date('2026-10-04T12:15:00.000Z')
const PLATFORM_USER_ID = '1c6f0a2e-3b4d-4e5f-8a9b-0c1d2e3f4a5b'
const EMAIL = 'admin@example.com'
const PASSWORD_HASH =
  '$2b$10$abcdefghijklmnopqrstuuVwxyzABCDEFGHIJKLMNOPQRSTUVWX'
const COLUMNS = [
  'id',
  'name',
  'email',
  'password_hash',
  'role',
  'failed_attempts',
  'locked_until'
]
const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

// A new builder per knex call; `then` is bound to a real promise (rule PA3).
const createMockQueryBuilder = ({ result = [], row } = {}) => {
  const qb = {
    select: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    forUpdate: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    first: jest.fn().mockResolvedValue(row)
  }
  const promise = Promise.resolve(result)
  qb.then = promise.then.bind(promise)
  qb.catch = promise.catch.bind(promise)
  return qb
}

const accountRow = () => ({
  id: uuidToBin(PLATFORM_USER_ID),
  name: 'Platform Admin',
  email: EMAIL,
  password_hash: PASSWORD_HASH,
  role: 'platform_admin',
  failed_attempts: 2,
  locked_until: null
})

const expectedAccount = {
  id: PLATFORM_USER_ID,
  name: 'Platform Admin',
  email: EMAIL,
  passwordHash: PASSWORD_HASH,
  role: 'platform_admin',
  failedAttempts: 2,
  lockedUntil: null
}

describe('platform-user.model', () => {
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
    it('should return the mapped account read with the read handle', async () => {
      useDb({ row: accountRow() })

      const account = await PlatformUserModel.findByEmail(EMAIL)

      expect(account).toEqual(expectedAccount)
      expect(db.getDb).toHaveBeenCalledWith({ operation: 'read' })
      expect(db.getDb.mock.results[0].value).toHaveBeenCalledWith(
        'platform_users'
      )
      expect(builders[0].select).toHaveBeenCalledWith(COLUMNS)
      expect(builders[0].where).toHaveBeenCalledWith('email', EMAIL)
      expect(builders[0].first).toHaveBeenCalledTimes(1)
    })

    it('should return null when no account has the e-mail', async () => {
      useDb({ row: undefined })

      await expect(PlatformUserModel.findByEmail(EMAIL)).resolves.toBeNull()
    })

    it('should read through the given transaction', async () => {
      const trx = createKnex({ row: accountRow() })

      const account = await PlatformUserModel.findByEmail(EMAIL, trx)

      expect(account).toEqual(expectedAccount)
      expect(db.getDb).not.toHaveBeenCalled()
      expect(trx).toHaveBeenCalledWith('platform_users')
    })
  })

  describe('findByEmailForUpdate', () => {
    it('should lock the row with FOR UPDATE inside the given transaction', async () => {
      const trx = createKnex({ row: accountRow() })

      const account = await PlatformUserModel.findByEmailForUpdate(EMAIL, trx)

      expect(account).toEqual(expectedAccount)
      expect(db.getDb).not.toHaveBeenCalled()
      expect(trx).toHaveBeenCalledWith('platform_users')
      const qb = builders[0]
      expect(qb.select).toHaveBeenCalledWith(COLUMNS)
      expect(qb.where).toHaveBeenCalledWith('email', EMAIL)
      expect(qb.forUpdate).toHaveBeenCalledTimes(1)
      expect(qb.first).toHaveBeenCalledTimes(1)
    })

    it('should return null when no account has the e-mail', async () => {
      const trx = createKnex({ row: undefined })

      await expect(
        PlatformUserModel.findByEmailForUpdate(EMAIL, trx)
      ).resolves.toBeNull()
    })
  })

  describe('existsAny', () => {
    it.each([
      ['a row exists', { id: uuidToBin(PLATFORM_USER_ID) }, true],
      ['the table is empty', undefined, false]
    ])('should answer whether %s', async (_case, row, expected) => {
      useDb({ row })

      await expect(PlatformUserModel.existsAny()).resolves.toBe(expected)
      expect(db.getDb).toHaveBeenCalledWith({ operation: 'read' })
      expect(builders[0].select).toHaveBeenCalledWith('id')
      expect(builders[0].where).not.toHaveBeenCalled()
    })

    it('should read through the given transaction', async () => {
      const trx = createKnex({ row: undefined })

      await expect(PlatformUserModel.existsAny(trx)).resolves.toBe(false)
      expect(db.getDb).not.toHaveBeenCalled()
      expect(trx).toHaveBeenCalledWith('platform_users')
    })
  })

  describe('emailExists', () => {
    it.each([
      [
        'true when the e-mail is taken',
        { id: uuidToBin(PLATFORM_USER_ID) },
        true
      ],
      ['false when the e-mail is free', undefined, false]
    ])('should return %s', async (_case, row, expected) => {
      useDb({ row })

      await expect(PlatformUserModel.emailExists(EMAIL)).resolves.toBe(expected)
      expect(builders[0].select).toHaveBeenCalledWith('id')
      expect(builders[0].where).toHaveBeenCalledWith('email', EMAIL)
    })

    it('should read through the given transaction', async () => {
      const trx = createKnex({ row: { id: uuidToBin(PLATFORM_USER_ID) } })

      await expect(PlatformUserModel.emailExists(EMAIL, trx)).resolves.toBe(
        true
      )
      expect(db.getDb).not.toHaveBeenCalled()
      expect(trx).toHaveBeenCalledWith('platform_users')
    })
  })

  describe('create', () => {
    it('should insert the account with a binary UUID v4 and return the id', async () => {
      const id = await PlatformUserModel.create({
        name: 'Platform Admin',
        email: EMAIL,
        passwordHash: PASSWORD_HASH
      })

      expect(id).toMatch(UUID_V4)
      expect(db.getDb).toHaveBeenCalledWith({ operation: 'write' })
      expect(db.getDb.mock.results[0].value).toHaveBeenCalledWith(
        'platform_users'
      )
      expect(builders[0].insert).toHaveBeenCalledWith({
        id: uuidToBin(id),
        name: 'Platform Admin',
        email: EMAIL,
        password_hash: PASSWORD_HASH
      })
    })

    it('should insert through the given transaction', async () => {
      const trx = createKnex()

      await PlatformUserModel.create(
        { name: 'Platform Admin', email: EMAIL, passwordHash: PASSWORD_HASH },
        trx
      )

      expect(db.getDb).not.toHaveBeenCalled()
      expect(trx).toHaveBeenCalledWith('platform_users')
      expect(builders[0].insert).toHaveBeenCalledTimes(1)
    })
  })

  describe('registerFailure', () => {
    it('should store the failure counter, the lock and updated_at', async () => {
      useDb({ result: 1 })

      const count = await PlatformUserModel.registerFailure(PLATFORM_USER_ID, {
        failedAttempts: 0,
        lockedUntil: LOCKED_UNTIL
      })

      expect(count).toBe(1)
      expect(db.getDb).toHaveBeenCalledWith({ operation: 'write' })
      expect(builders[0].where).toHaveBeenCalledWith(
        'id',
        uuidToBin(PLATFORM_USER_ID)
      )
      expect(builders[0].update).toHaveBeenCalledWith({
        failed_attempts: 0,
        locked_until: LOCKED_UNTIL,
        updated_at: NOW
      })
    })

    it('should update through the given transaction', async () => {
      const trx = createKnex({ result: 1 })

      await PlatformUserModel.registerFailure(
        PLATFORM_USER_ID,
        { failedAttempts: 3, lockedUntil: null },
        trx
      )

      expect(db.getDb).not.toHaveBeenCalled()
      expect(trx).toHaveBeenCalledWith('platform_users')
      expect(builders[0].update).toHaveBeenCalledWith({
        failed_attempts: 3,
        locked_until: null,
        updated_at: NOW
      })
    })
  })

  describe('registerSuccess', () => {
    it('should reset the counter and the lock and set last_login_at', async () => {
      useDb({ result: 1 })

      const count = await PlatformUserModel.registerSuccess(PLATFORM_USER_ID)

      expect(count).toBe(1)
      expect(db.getDb).toHaveBeenCalledWith({ operation: 'write' })
      expect(builders[0].where).toHaveBeenCalledWith(
        'id',
        uuidToBin(PLATFORM_USER_ID)
      )
      expect(builders[0].update).toHaveBeenCalledWith({
        failed_attempts: 0,
        locked_until: null,
        last_login_at: NOW,
        updated_at: NOW
      })
    })

    it('should update through the given transaction', async () => {
      const trx = createKnex({ result: 1 })

      await PlatformUserModel.registerSuccess(PLATFORM_USER_ID, trx)

      expect(db.getDb).not.toHaveBeenCalled()
      expect(trx).toHaveBeenCalledWith('platform_users')
      expect(builders[0].update).toHaveBeenCalledTimes(1)
    })
  })
})
