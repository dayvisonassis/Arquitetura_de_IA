const request = require('supertest')
const app = require('../../src/app')
const { generateToken } = require('../utils/auth')
const { countQueries } = require('../utils/query-counter')
const {
  setupTestDatabase,
  cleanupTestDatabase
} = require('../utils/test-setup')
const {
  createTestDomain,
  createTestPlatformUser,
  createTestUser,
  deleteTestDomain,
  deleteTestPlatformUser,
  deleteTestUser
} = require('../utils/permission-helper')

// Outside every feature range of the permission catalog.
const FIRST_TEST_PERMISSION_ID = 990001

const toBin = uuid => Buffer.from(uuid.replace(/-/g, ''), 'hex')

describe('Me API', () => {
  let db, user, domain, authToken
  const dbWrite = () => db.getDb({ operation: 'write' })

  const getMe = (token, headers = {}) =>
    request(app)
      .get('/v2/me')
      .set({ ...headers, Authorization: `Bearer ${token}` })

  const userToken = account =>
    generateToken({
      user: { id: account.id, dr_domain_id: account.dr_domain_id }
    })

  beforeAll(async () => {
    ;({ db, user, domain } = await setupTestDatabase())
    authToken = await generateToken({
      user: { id: user.id, dr_domain_id: domain.domain_id }
    })
  })

  afterAll(async () => {
    await cleanupTestDatabase()
  })

  describe('GET /v2/me', () => {
    it('should return name, role, domain and permissions of the platform admin', async () => {
      let platformUser = null
      try {
        platformUser = await createTestPlatformUser()
        const token = await generateToken({
          platformUser: { id: platformUser.id }
        })

        const response = await getMe(token)

        expect(response.status).toBe(200)
        expect(response.body).toEqual({
          id: platformUser.id,
          name: 'Test platform admin',
          email: platformUser.email,
          role: 'platform_admin',
          domain: null,
          permissions: ['users.read']
        })
      } finally {
        if (platformUser) await deleteTestPlatformUser(platformUser.id)
      }
    })

    it('should return name, role, domain and permissions of the domain admin', async () => {
      const response = await getMe(authToken)

      expect(response.status).toBe(200)
      expect(response.body).toEqual({
        id: user.id,
        name: user.name,
        email: user.email,
        role: 'domain_admin',
        domain: { id: domain.domain_id, name: domain.name },
        permissions: ['playground.read', 'users.read']
      })
    })

    it('should return name, role, domain and permissions of the user', async () => {
      let domainUser = null
      try {
        domainUser = await createTestUser({
          domainId: domain.domain_id,
          role: 'user'
        })

        const response = await getMe(await userToken(domainUser))

        expect(response.status).toBe(200)
        expect(response.body).toEqual({
          id: domainUser.id,
          name: 'Test user',
          email: domainUser.email,
          role: 'user',
          domain: { id: domain.domain_id, name: domain.name },
          permissions: ['playground.read']
        })
      } finally {
        if (domainUser) await deleteTestUser(domainUser.id)
      }
    })

    it('should ignore X-Domain-Id', async () => {
      let otherDomain = null
      let platformUser = null
      try {
        otherDomain = await createTestDomain()
        platformUser = await createTestPlatformUser()
        const platformToken = await generateToken({
          platformUser: { id: platformUser.id }
        })
        const headers = { 'X-Domain-Id': otherDomain.domain_id }

        const domainResponse = await getMe(authToken, headers)
        const platformResponse = await getMe(platformToken, headers)

        expect(domainResponse.status).toBe(200)
        expect(domainResponse.body.domain).toEqual({
          id: domain.domain_id,
          name: domain.name
        })
        expect(platformResponse.status).toBe(200)
        expect(platformResponse.body.domain).toBeNull()
      } finally {
        if (platformUser) await deleteTestPlatformUser(platformUser.id)
        if (otherDomain) await deleteTestDomain(otherDomain.domain_id)
      }
    })

    it('should reflect a role change on the next request', async () => {
      let domainUser = null
      try {
        domainUser = await createTestUser({
          domainId: domain.domain_id,
          role: 'user'
        })
        const token = await userToken(domainUser)
        const before = await getMe(token)
        await dbWrite()('users')
          .where('id', toBin(domainUser.id))
          .update({ role: 'domain_admin' })

        const after = await getMe(token)

        expect(before.status).toBe(200)
        expect(before.body.role).toBe('user')
        expect(before.body.permissions).toEqual(['playground.read'])
        expect(after.status).toBe(200)
        expect(after.body.role).toBe('domain_admin')
        expect(after.body.permissions).toEqual([
          'playground.read',
          'users.read'
        ])
      } finally {
        if (domainUser) await deleteTestUser(domainUser.id)
      }
    })

    it('should not grow the number of queries with the number of permissions of the role', async () => {
      let domainUser = null
      const permissionIds = []
      const mappedIds = []
      const seedPermission = async () => {
        const id = FIRST_TEST_PERMISSION_ID + permissionIds.length
        await dbWrite()('permissions').insert({
          id,
          area: `query-growth-${id}`,
          action: 'read'
        })
        permissionIds.push(id)
        await dbWrite()('role_permissions').insert({
          role: 'user',
          permission_id: id
        })
        mappedIds.push(id)
      }
      try {
        domainUser = await createTestUser({
          domainId: domain.domain_id,
          role: 'user'
        })
        const token = await userToken(domainUser)
        const me = () => getMe(token)
        await seedPermission()
        // Unmeasured call with one record in place: caches fill here (Q6)
        await me()
        const one = await countQueries(me)

        for (let i = 0; i < 4; i++) {
          await seedPermission()
        }
        await me()
        const five = await countQueries(me)

        expect(one.result.status).toBe(200)
        expect(five.result.status).toBe(200)
        expect(five.result.body.permissions).toHaveLength(
          one.result.body.permissions.length + 4
        )
        expect(five.queries).toHaveLength(one.count)
      } finally {
        try {
          if (mappedIds.length > 0) {
            await dbWrite()('role_permissions')
              .where('role', 'user')
              .whereIn('permission_id', mappedIds)
              .delete()
          }
        } catch (error) {
          console.error(`Could not delete test role permissions: ${error}`)
        }
        try {
          if (permissionIds.length > 0) {
            await dbWrite()('permissions').whereIn('id', permissionIds).delete()
          }
        } catch (error) {
          console.error(`Could not delete test permissions: ${error}`)
        }
        if (domainUser) await deleteTestUser(domainUser.id)
      }
    })
  })
})
