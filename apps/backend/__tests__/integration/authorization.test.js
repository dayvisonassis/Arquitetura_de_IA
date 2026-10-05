const { randomUUID } = require('crypto')
const express = require('express')
const request = require('supertest')
const app = require('../../src/app')
const { config } = require('../../src/config/env')
const {
  authenticate
} = require('../../src/middleware/authentication.middleware')
const {
  checkPermission,
  requirePlatformAdmin
} = require('../../src/middleware/authorization.middleware')
const {
  errorHandler
} = require('../../src/middleware/error-handler.middleware')
const { generateToken } = require('../utils/auth')
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

const FORBIDDEN = {
  message: 'Você não tem permissão para acessar esta página.'
}
const DOMAIN_REQUIRED = { message: 'Escolha um domínio.' }
const DOMAIN_NOT_FOUND = { message: 'Domínio não encontrado.' }

// Routes mounted only in this test: no product route uses the middlewares yet.
const buildRoutesApp = () => {
  const routesApp = express()
  const respond = (req, res) => {
    res.status(200).json({ domainId: req.domainId })
  }
  routesApp.use(express.json())
  routesApp.use(authenticate)
  routesApp.get('/shared', checkPermission('users', 'read'), respond)
  routesApp.get('/platform', requirePlatformAdmin, respond)
  routesApp.use(errorHandler)
  return routesApp
}

describe('Authorization middlewares', () => {
  let user, domain, adminToken, platformUser, platformToken
  const routesApp = buildRoutesApp()

  const call = (path, token, domainId) => {
    const pending = request(routesApp)
      .get(path)
      .set('Authorization', `Bearer ${token}`)
    return domainId === undefined
      ? pending
      : pending.set('X-Domain-Id', domainId)
  }

  beforeAll(async () => {
    ;({ user, domain } = await setupTestDatabase())
    adminToken = await generateToken({
      user: { id: user.id, dr_domain_id: domain.domain_id }
    })
    platformUser = await createTestPlatformUser()
    platformToken = await generateToken({
      platformUser: { id: platformUser.id }
    })
  })

  afterAll(async () => {
    try {
      if (platformUser) await deleteTestPlatformUser(platformUser.id)
    } finally {
      await cleanupTestDatabase()
    }
  })

  describe('checkPermission', () => {
    it('should answer 403 to a user on a route that requires users.read', async () => {
      let domainUser = null
      try {
        domainUser = await createTestUser({
          domainId: domain.domain_id,
          role: 'user'
        })
        const token = await generateToken({
          user: { id: domainUser.id, dr_domain_id: domain.domain_id }
        })

        const response = await call('/shared', token)

        expect(response.status).toBe(403)
        expect(response.body).toEqual(FORBIDDEN)
      } finally {
        if (domainUser) await deleteTestUser(domainUser.id)
      }
    })

    it('should let a domain admin in with its own domain', async () => {
      const response = await call('/shared', adminToken)

      expect(response.status).toBe(200)
      expect(response.body).toEqual({ domainId: domain.domain_id })
    })

    it('should ignore X-Domain-Id for a domain user', async () => {
      let otherDomain = null
      try {
        otherDomain = await createTestDomain()

        const otherHeader = await call(
          '/shared',
          adminToken,
          otherDomain.domain_id
        )
        const invalidHeader = await call('/shared', adminToken, 'not-a-uuid')

        expect(otherHeader.status).toBe(200)
        expect(otherHeader.body).toEqual({ domainId: domain.domain_id })
        expect(invalidHeader.status).toBe(200)
        expect(invalidHeader.body).toEqual({ domainId: domain.domain_id })
      } finally {
        if (otherDomain) await deleteTestDomain(otherDomain.domain_id)
      }
    })

    it('should validate X-Domain-Id for the platform admin', async () => {
      let removedDomain = null
      let inactiveDomain = null
      try {
        removedDomain = await createTestDomain({ status: 'removed' })
        inactiveDomain = await createTestDomain({ status: 'inactive' })

        const missing = await call('/shared', platformToken)
        const notFound = []
        for (const domainId of [
          'not-a-uuid',
          randomUUID(),
          removedDomain.domain_id
        ]) {
          notFound.push(await call('/shared', platformToken, domainId))
        }
        const accepted = []
        for (const domainId of [domain.domain_id, inactiveDomain.domain_id]) {
          accepted.push(await call('/shared', platformToken, domainId))
        }

        expect(missing.status).toBe(400)
        expect(missing.body).toEqual(DOMAIN_REQUIRED)
        for (const response of notFound) {
          expect(response.status).toBe(404)
          expect(response.body).toEqual(DOMAIN_NOT_FOUND)
        }
        expect(accepted.map(response => response.status)).toEqual([200, 200])
        expect(accepted.map(response => response.body)).toEqual([
          { domainId: domain.domain_id },
          { domainId: inactiveDomain.domain_id }
        ])
      } finally {
        if (inactiveDomain) await deleteTestDomain(inactiveDomain.domain_id)
        if (removedDomain) await deleteTestDomain(removedDomain.domain_id)
      }
    })
  })

  describe('requirePlatformAdmin', () => {
    it('should answer 403 to a domain admin on a platform route', async () => {
      const response = await call('/platform', adminToken)

      expect(response.status).toBe(403)
      expect(response.body).toEqual(FORBIDDEN)
    })

    it('should answer 403 to a user on a platform route', async () => {
      let domainUser = null
      try {
        domainUser = await createTestUser({
          domainId: domain.domain_id,
          role: 'user'
        })
        const token = await generateToken({
          user: { id: domainUser.id, dr_domain_id: domain.domain_id }
        })

        const response = await call('/platform', token)

        expect(response.status).toBe(403)
        expect(response.body).toEqual(FORBIDDEN)
      } finally {
        if (domainUser) await deleteTestUser(domainUser.id)
      }
    })

    it('should let the platform admin in on a platform route', async () => {
      const response = await call('/platform', platformToken)

      expect(response.status).toBe(200)
      expect(response.body).toEqual({ domainId: null })
    })
  })

  describe('CORS', () => {
    it('should allow the x-domain-id header in a preflight from the frontend origin', async () => {
      expect(config.frontendOrigin).toBe('http://127.0.0.1:4200')

      const response = await request(app)
        .options('/v2/me')
        .set('Origin', 'http://127.0.0.1:4200')
        .set('Access-Control-Request-Method', 'GET')
        .set('Access-Control-Request-Headers', 'authorization,x-domain-id')

      expect(response.status).toBe(204)
      expect(response.headers['access-control-allow-origin']).toBe(
        'http://127.0.0.1:4200'
      )
      const allowed = response.headers['access-control-allow-headers']
        .split(',')
        .map(header => header.trim().toLowerCase())
      expect(allowed).toEqual(
        expect.arrayContaining(['authorization', 'x-domain-id'])
      )
    })
  })
})
