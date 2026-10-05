const { randomUUID } = require('crypto')
const bcrypt = require('bcrypt')
const {
  ensurePlatformAdmin
} = require('../../src/services/platform-admin-bootstrap.service')
const {
  isEmailTaken
} = require('../../src/services/email-availability.service')
const {
  setupTestDatabase,
  cleanupTestDatabase
} = require('../utils/test-setup')
const {
  createTestPlatformUser,
  createTestUser,
  deleteTestPlatformUser,
  deleteTestUser
} = require('../utils/permission-helper')

const BOOTSTRAP_PASSWORD = 'Bootstrap-pass-01'

const uniqueLocalPart = prefix => `${prefix}-${randomUUID().slice(0, 8)}`
const pause = ms => new Promise(resolve => setTimeout(resolve, ms))

describe('Platform admin bootstrap', () => {
  let db, domain
  const dbWrite = () => db.getDb({ operation: 'write' })

  const countPlatformUsers = async () => {
    const [row] = await dbWrite()('platform_users').count({ total: '*' })
    return Number(row.total)
  }

  // Removes a platform user created by the code under test, found by the
  // unique e-mail the test generated.
  const deletePlatformUserByEmail = async email => {
    try {
      const row = await dbWrite()('platform_users')
        .select('id')
        .where('email', email)
        .first()
      if (row) {
        await dbWrite()('active_sessions')
          .where('platform_user_id', row.id)
          .delete()
        await dbWrite()('platform_users').where('id', row.id).delete()
      }
    } catch (error) {
      console.error(`Could not delete platform user ${email}: ${error.message}`)
    }
  }

  beforeAll(async () => {
    ;({ db, domain } = await setupTestDatabase())
  })

  afterAll(async () => {
    await cleanupTestDatabase()
  })

  describe('ensurePlatformAdmin', () => {
    beforeEach(async () => {
      const existing = await countPlatformUsers()
      if (existing !== 0) {
        throw new Error(
          `This suite needs an empty platform_users table in web_test, but it has ${existing} row(s). ` +
            'Remove them by hand before running it; the test never deletes rows it did not create.'
        )
      }
    })

    it('should create the platform admin once and leave it unchanged on the next start', async () => {
      const localPart = uniqueLocalPart('bootstrap')
      const normalized = `${localPart}@example.test`
      try {
        const first = await ensurePlatformAdmin({
          email: `  ${localPart.toUpperCase()}@Example.TEST  `,
          password: BOOTSTRAP_PASSWORD
        })
        const created = await dbWrite()('platform_users')
          .where('email', normalized)
          .first()
        await pause(20)

        const second = await ensurePlatformAdmin({
          email: `other-${normalized}`,
          password: 'Another-pass-02'
        })

        expect(first).toEqual({ created: true, id: expect.any(String) })
        expect(created).toBeDefined()
        expect(created.id.toString('hex')).toBe(first.id.replace(/-/g, ''))
        expect(created.name).toBe('Administrador da plataforma')
        expect(created.role).toBe('platform_admin')
        expect(created.password_hash).toMatch(/^\$2b\$10\$[./A-Za-z0-9]{53}$/)
        expect(
          await bcrypt.compare(BOOTSTRAP_PASSWORD, created.password_hash)
        ).toBe(true)
        expect(second).toEqual({ created: false })
        expect(await countPlatformUsers()).toBe(1)
        const unchanged = await dbWrite()('platform_users')
          .where('email', normalized)
          .first()
        expect(unchanged.updated_at.getTime()).toBe(
          created.updated_at.getTime()
        )
        expect(unchanged.password_hash).toBe(created.password_hash)
      } finally {
        await deletePlatformUserByEmail(normalized)
        await deletePlatformUserByEmail(`other-${normalized}`)
      }
    })

    it('should refuse a platform admin e-mail already used by a domain user', async () => {
      let domainUser = null
      try {
        domainUser = await createTestUser({
          domainId: domain.domain_id,
          role: 'user'
        })

        await expect(
          ensurePlatformAdmin({
            email: ` ${domainUser.email.toUpperCase()} `,
            password: BOOTSTRAP_PASSWORD
          })
        ).rejects.toThrow(
          'PLATFORM_ADMIN_EMAIL is already used by a domain user'
        )

        expect(await countPlatformUsers()).toBe(0)
      } finally {
        if (domainUser) {
          await deletePlatformUserByEmail(domainUser.email)
          await deleteTestUser(domainUser.id)
        }
      }
    })
  })

  describe('isEmailTaken', () => {
    it('should report an e-mail taken in either identity', async () => {
      let platformUser = null
      let domainUser = null
      try {
        platformUser = await createTestPlatformUser()
        domainUser = await createTestUser({
          domainId: domain.domain_id,
          role: 'user'
        })

        const platformTaken = await isEmailTaken(
          platformUser.email.toUpperCase()
        )
        const domainTaken = await isEmailTaken(`  ${domainUser.email}  `)
        const freeEmail = await isEmailTaken(
          `${uniqueLocalPart('free')}@example.test`
        )
        const inTransaction = await dbWrite().transaction(trx =>
          Promise.all([
            isEmailTaken(platformUser.email, { trx }),
            isEmailTaken(domainUser.email, { trx })
          ])
        )

        expect(platformTaken).toBe(true)
        expect(domainTaken).toBe(true)
        expect(freeEmail).toBe(false)
        expect(inTransaction).toEqual([true, true])
      } finally {
        if (domainUser) await deleteTestUser(domainUser.id)
        if (platformUser) await deleteTestPlatformUser(platformUser.id)
      }
    })
  })
})
