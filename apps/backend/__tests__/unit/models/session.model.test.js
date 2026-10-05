jest.mock('../../../database', () => ({ getDb: jest.fn() }))

import db from '../../../database'
import SessionModel from '../../../src/models/session.model'
import { uuidToBin } from '../../../src/utils/uuid.utils'

const NOW = new Date('2026-10-04T12:00:00.000Z')
const EXPIRES_AT = new Date('2026-10-04T20:00:00.000Z')
const SESSION_ID = '4bf92f35-77b3-4da6-a3ce-929d0e0e4736'
const PLATFORM_USER_ID = '1c6f0a2e-3b4d-4e5f-8a9b-0c1d2e3f4a5b'
const USER_ID = '2d7a1b3f-4c5e-4f60-9b0c-1d2e3f4a5b6c'
const DOMAIN_ID = '3e8b2c4a-5d6f-4071-8c1d-2e3f4a5b6c7d'
const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

// A new builder per knex call; `then` is bound to a real promise (rule PA3).
const createMockQueryBuilder = ({ result = [], row } = {}) => {
  const qb = {
    select: jest.fn().mockReturnThis(),
    from: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    whereNull: jest.fn().mockReturnThis(),
    whereIn: jest.fn().mockReturnThis(),
    leftJoin: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    first: jest.fn().mockResolvedValue(row)
  }
  const promise = Promise.resolve(result)
  qb.then = promise.then.bind(promise)
  qb.catch = promise.catch.bind(promise)
  return qb
}

describe('session.model', () => {
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

  const platformRow = () => ({
    platform_user_id: uuidToBin(PLATFORM_USER_ID),
    user_id: null,
    expires_at: EXPIRES_AT,
    revoked_at: null,
    platform_name: 'Platform Admin',
    platform_email: 'admin@example.com',
    platform_role: 'platform_admin',
    user_name: null,
    user_email: null,
    user_role: null,
    dr_domain_id: null,
    domain_name: null,
    domain_status: null
  })

  const domainRow = overrides => ({
    platform_user_id: null,
    user_id: uuidToBin(USER_ID),
    expires_at: EXPIRES_AT,
    revoked_at: null,
    platform_name: null,
    platform_email: null,
    platform_role: null,
    user_name: 'Domain User',
    user_email: 'user@example.com',
    user_role: 'user',
    dr_domain_id: uuidToBin(DOMAIN_ID),
    domain_name: 'Example Domain',
    domain_status: 'active',
    ...overrides
  })

  beforeEach(() => {
    jest.clearAllMocks()
    jest.useFakeTimers({ now: NOW })
    builders = []
    useDb()
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  describe('create', () => {
    it('should return a UUID v4 and insert its binary form with the write handle', async () => {
      const id = await SessionModel.create({
        platformUserId: PLATFORM_USER_ID,
        expiresAt: EXPIRES_AT,
        ipAddress: '203.0.113.10',
        userAgent: 'Mozilla/5.0'
      })

      expect(id).toMatch(UUID_V4)
      expect(db.getDb).toHaveBeenCalledTimes(1)
      expect(db.getDb).toHaveBeenCalledWith({ operation: 'write' })
      const knex = db.getDb.mock.results[0].value
      expect(knex).toHaveBeenCalledWith('active_sessions')
      expect(builders[0].insert).toHaveBeenCalledWith({
        id: uuidToBin(id),
        platform_user_id: uuidToBin(PLATFORM_USER_ID),
        user_id: null,
        expires_at: EXPIRES_AT,
        ip_address: '203.0.113.10',
        user_agent: 'Mozilla/5.0'
      })
    })

    it('should store a domain owner in user_id and leave platform_user_id null', async () => {
      await SessionModel.create({ userId: USER_ID, expiresAt: EXPIRES_AT })

      const row = builders[0].insert.mock.calls[0][0]
      expect(row.user_id).toEqual(uuidToBin(USER_ID))
      expect(row.platform_user_id).toBeNull()
    })

    it('should truncate the user agent to 255 characters', async () => {
      await SessionModel.create({
        userId: USER_ID,
        expiresAt: EXPIRES_AT,
        userAgent: 'a'.repeat(300)
      })

      expect(builders[0].insert.mock.calls[0][0].user_agent).toBe(
        'a'.repeat(255)
      )
    })

    it('should store null for a missing IP address and user agent', async () => {
      await SessionModel.create({ userId: USER_ID, expiresAt: EXPIRES_AT })

      const row = builders[0].insert.mock.calls[0][0]
      expect(row.ip_address).toBeNull()
      expect(row.user_agent).toBeNull()
    })

    it('should insert through the given transaction instead of the write handle', async () => {
      const trx = createKnex()

      const id = await SessionModel.create(
        { userId: USER_ID, expiresAt: EXPIRES_AT },
        trx
      )

      expect(db.getDb).not.toHaveBeenCalled()
      expect(trx).toHaveBeenCalledWith('active_sessions')
      expect(builders[0].insert.mock.calls[0][0].id).toEqual(uuidToBin(id))
    })

    it('should reject an invalid owner id without inserting', async () => {
      await expect(
        SessionModel.create({ userId: 'not-a-uuid', expiresAt: EXPIRES_AT })
      ).rejects.toThrow(new TypeError('Invalid UUID'))

      expect(builders[0].insert).not.toHaveBeenCalled()
    })
  })

  describe('findWithIdentity', () => {
    it('should return null when the session does not exist', async () => {
      useDb({ row: undefined })

      await expect(SessionModel.findWithIdentity(SESSION_ID)).resolves.toBe(
        null
      )
    })

    it('should read the session joined with both identities and the domain', async () => {
      useDb({ row: undefined })

      await SessionModel.findWithIdentity(SESSION_ID)

      expect(db.getDb).toHaveBeenCalledWith({ operation: 'read' })
      expect(db.getDb.mock.results[0].value).toHaveBeenCalledWith(
        'active_sessions as s'
      )
      const qb = builders[0]
      expect(qb.leftJoin.mock.calls).toEqual([
        ['platform_users as p', 'p.id', 's.platform_user_id'],
        ['users as u', 'u.id', 's.user_id'],
        ['dr_domain as d', 'd.id', 'u.dr_domain_id']
      ])
      expect(qb.select).toHaveBeenCalledWith(
        's.platform_user_id',
        's.user_id',
        's.expires_at',
        's.revoked_at',
        'p.name as platform_name',
        'p.email as platform_email',
        'p.role as platform_role',
        'u.name as user_name',
        'u.email as user_email',
        'u.role as user_role',
        'u.dr_domain_id',
        'd.name as domain_name',
        'd.status as domain_status'
      )
      expect(qb.where).toHaveBeenCalledWith('s.id', uuidToBin(SESSION_ID))
      expect(qb.first).toHaveBeenCalledTimes(1)
    })

    it('should map a platform session to a platform identity without domain', async () => {
      const revokedAt = new Date('2026-10-04T13:00:00.000Z')
      useDb({ row: { ...platformRow(), revoked_at: revokedAt } })

      const session = await SessionModel.findWithIdentity(SESSION_ID)

      expect(session).toEqual({
        id: SESSION_ID,
        expiresAt: EXPIRES_AT,
        revokedAt,
        identity: {
          type: 'platform',
          id: PLATFORM_USER_ID,
          name: 'Platform Admin',
          email: 'admin@example.com',
          role: 'platform_admin',
          domain: null
        }
      })
    })

    it('should map a domain session to a domain identity with its domain', async () => {
      useDb({ row: domainRow() })

      const session = await SessionModel.findWithIdentity(SESSION_ID)

      expect(session).toEqual({
        id: SESSION_ID,
        expiresAt: EXPIRES_AT,
        revokedAt: null,
        identity: {
          type: 'domain',
          id: USER_ID,
          name: 'Domain User',
          email: 'user@example.com',
          role: 'user',
          domain: { id: DOMAIN_ID, name: 'Example Domain', status: 'active' }
        }
      })
    })

    it('should map a domain identity without dr_domain_id to a null domain', async () => {
      useDb({
        row: domainRow({
          dr_domain_id: null,
          domain_name: null,
          domain_status: null
        })
      })

      const session = await SessionModel.findWithIdentity(SESSION_ID)

      expect(session.identity.type).toBe('domain')
      expect(session.identity.domain).toBeNull()
    })
  })

  describe('revoke', () => {
    it('should revoke a session not yet revoked and return the affected count', async () => {
      useDb({ result: 1 })

      const count = await SessionModel.revoke(SESSION_ID, 'logout')

      expect(count).toBe(1)
      expect(db.getDb).toHaveBeenCalledWith({ operation: 'write' })
      expect(db.getDb.mock.results[0].value).toHaveBeenCalledWith(
        'active_sessions'
      )
      const qb = builders[0]
      expect(qb.where).toHaveBeenCalledWith('id', uuidToBin(SESSION_ID))
      expect(qb.whereNull).toHaveBeenCalledWith('revoked_at')
      expect(qb.update).toHaveBeenCalledWith({
        revoked_at: NOW,
        revoked_reason: 'logout'
      })
    })

    it('should revoke through the given transaction', async () => {
      const trx = createKnex({ result: 1 })

      await SessionModel.revoke(SESSION_ID, 'logout', trx)

      expect(db.getDb).not.toHaveBeenCalled()
      expect(trx).toHaveBeenCalledWith('active_sessions')
      expect(builders[0].update).toHaveBeenCalledTimes(1)
    })
  })

  describe('revokeAllForUser', () => {
    it('should revoke only the valid sessions of the user and return the count', async () => {
      useDb({ result: 3 })

      const count = await SessionModel.revokeAllForUser(USER_ID, 'user_removed')

      expect(count).toBe(3)
      expect(db.getDb).toHaveBeenCalledWith({ operation: 'write' })
      const qb = builders[0]
      expect(qb.where).toHaveBeenCalledWith('user_id', uuidToBin(USER_ID))
      expect(qb.whereNull).toHaveBeenCalledWith('revoked_at')
      expect(qb.where).toHaveBeenCalledWith('expires_at', '>', NOW)
      expect(qb.update).toHaveBeenCalledWith({
        revoked_at: NOW,
        revoked_reason: 'user_removed'
      })
    })

    it('should revoke through the given transaction', async () => {
      const trx = createKnex({ result: 2 })

      const count = await SessionModel.revokeAllForUser(
        USER_ID,
        'user_removed',
        trx
      )

      expect(count).toBe(2)
      expect(db.getDb).not.toHaveBeenCalled()
      expect(trx).toHaveBeenCalledWith('active_sessions')
    })
  })

  describe('revokeAllForDomain', () => {
    it('should revoke the valid sessions of the domain users in a single UPDATE', async () => {
      useDb({ result: 5 })

      const count = await SessionModel.revokeAllForDomain(
        DOMAIN_ID,
        'domain_inactive'
      )

      expect(count).toBe(5)
      expect(db.getDb).toHaveBeenCalledTimes(1)
      expect(db.getDb).toHaveBeenCalledWith({ operation: 'write' })
      expect(builders).toHaveLength(1)
      const qb = builders[0]
      expect(qb.whereIn).toHaveBeenCalledWith('user_id', expect.any(Function))
      expect(qb.whereNull).toHaveBeenCalledWith('revoked_at')
      expect(qb.where).toHaveBeenCalledWith('expires_at', '>', NOW)
      expect(qb.update).toHaveBeenCalledTimes(1)
      expect(qb.update).toHaveBeenCalledWith({
        revoked_at: NOW,
        revoked_reason: 'domain_inactive'
      })

      // The subquery selects the ids of the users of the domain.
      const subquery = createMockQueryBuilder()
      qb.whereIn.mock.calls[0][1](subquery)
      expect(subquery.select).toHaveBeenCalledWith('id')
      expect(subquery.from).toHaveBeenCalledWith('users')
      expect(subquery.where).toHaveBeenCalledWith(
        'dr_domain_id',
        uuidToBin(DOMAIN_ID)
      )
    })

    it('should revoke through the given transaction', async () => {
      const trx = createKnex({ result: 0 })

      const count = await SessionModel.revokeAllForDomain(
        DOMAIN_ID,
        'domain_removed',
        trx
      )

      expect(count).toBe(0)
      expect(db.getDb).not.toHaveBeenCalled()
      expect(trx).toHaveBeenCalledWith('active_sessions')
      expect(builders[0].update).toHaveBeenCalledWith({
        revoked_at: NOW,
        revoked_reason: 'domain_removed'
      })
    })
  })
})
