const { randomUUID } = require('crypto')
const jwt = require('jsonwebtoken')
const request = require('supertest')
const app = require('../../src/app')
const { config } = require('../../src/config/env')
const { generateToken } = require('../utils/auth')
const {
  setupTestDatabase,
  cleanupTestDatabase
} = require('../utils/test-setup')
const {
  createTestDomain,
  createTestUser,
  deleteTestDomain,
  deleteTestUser
} = require('../utils/permission-helper')

const SESSION_EXPIRED = { message: 'Sua sessão expirou. Entre novamente.' }

const toBin = uuid => Buffer.from(uuid.replace(/-/g, ''), 'hex')
const sessionIdOf = token => jwt.decode(token).data.session_id
const secondsFromNow = seconds => Math.floor(Date.now() / 1000) + seconds

const signToken = ({ sessionId, user, exp }) =>
  jwt.sign({ data: { session_id: sessionId, user }, exp }, config.jwtSecret, {
    algorithm: 'HS256'
  })

// Rewrites the payload and keeps the original signature.
const tamperPayload = token => {
  const [header, payload, signature] = token.split('.')
  const claims = JSON.parse(Buffer.from(payload, 'base64url').toString())
  claims.data.user.id = randomUUID()
  const forged = Buffer.from(JSON.stringify(claims)).toString('base64url')
  return [header, forged, signature].join('.')
}

describe('Session authentication API', () => {
  let db, user, domain
  const dbWrite = () => db.getDb({ operation: 'write' })

  const sharedToken = () =>
    generateToken({ user: { id: user.id, dr_domain_id: domain.domain_id } })

  const getMe = token => {
    const call = request(app).get('/v2/me')
    return token ? call.set('Authorization', `Bearer ${token}`) : call
  }

  const updateSession = (sessionId, changes) =>
    dbWrite()('active_sessions').where('id', toBin(sessionId)).update(changes)

  beforeAll(async () => {
    ;({ db, user, domain } = await setupTestDatabase())
  })

  afterAll(async () => {
    await cleanupTestDatabase()
  })

  describe('authenticate', () => {
    it('should answer 401 without a token, with a tampered token and with a revoked session', async () => {
      const valid = await sharedToken()
      const revoked = await sharedToken()
      await updateSession(sessionIdOf(revoked), {
        revoked_at: new Date(),
        revoked_reason: 'logout'
      })

      const responses = [
        await getMe(),
        await getMe(tamperPayload(valid)),
        await getMe(revoked)
      ]

      for (const response of responses) {
        expect(response.status).toBe(401)
        expect(response.body).toEqual(SESSION_EXPIRED)
      }
      expect((await getMe(valid)).status).toBe(200)
    })

    it('should answer 401 to a malformed or unknown credential', async () => {
      const valid = await sharedToken()
      const tokenUser = {
        id: user.id,
        type: 'domain',
        dr_domain_id: domain.domain_id
      }
      const headers = [
        `Token ${valid}`,
        'Bearer ',
        'Bearer not-a-jwt',
        `Bearer ${signToken({ sessionId: 'not-a-uuid', user: tokenUser, exp: secondsFromNow(60) })}`,
        `Bearer ${signToken({ sessionId: randomUUID(), user: tokenUser, exp: secondsFromNow(60) })}`
      ]

      for (const header of headers) {
        const response = await request(app)
          .get('/v2/me')
          .set('Authorization', header)

        expect(response.status).toBe(401)
        expect(response.body).toEqual(SESSION_EXPIRED)
      }
    })

    it('should refuse a session older than 8 hours', async () => {
      const expiresAt = new Date(Math.floor((Date.now() - 60000) / 1000) * 1000)
      const token = await generateToken({
        user: { id: user.id, dr_domain_id: domain.domain_id },
        expiresAt
      })

      const response = await getMe(token)

      expect(response.status).toBe(401)
      expect(response.body).toEqual(SESSION_EXPIRED)
    })

    it('should refuse a token whose session expired in the database', async () => {
      const token = await sharedToken()
      expect((await getMe(token)).status).toBe(200)
      await updateSession(sessionIdOf(token), {
        expires_at: new Date(Date.now() - 1000)
      })

      const response = await getMe(token)

      expect(response.status).toBe(401)
      expect(response.body).toEqual(SESSION_EXPIRED)
    })

    it('should refuse an expired JWT of a session still valid in the database', async () => {
      const token = await sharedToken()
      const expiredJwt = signToken({
        sessionId: sessionIdOf(token),
        user: { id: user.id, type: 'domain', dr_domain_id: domain.domain_id },
        exp: secondsFromNow(-60)
      })

      const response = await getMe(expiredJwt)

      expect(response.status).toBe(401)
      expect(response.body).toEqual(SESSION_EXPIRED)
      expect((await getMe(token)).status).toBe(200)
    })

    it('should refuse a token whose user does not own the session', async () => {
      let otherUser = null
      try {
        otherUser = await createTestUser({
          domainId: domain.domain_id,
          role: 'user'
        })
        const token = await sharedToken()
        const sessionId = sessionIdOf(token)
        const exp = secondsFromNow(60)
        const forged = [
          signToken({
            sessionId,
            user: {
              id: otherUser.id,
              type: 'domain',
              dr_domain_id: domain.domain_id
            },
            exp
          }),
          signToken({ sessionId, user: { id: user.id, type: 'platform' }, exp })
        ]

        for (const forgedToken of forged) {
          const response = await getMe(forgedToken)

          expect(response.status).toBe(401)
          expect(response.body).toEqual(SESSION_EXPIRED)
        }
      } finally {
        if (otherUser) await deleteTestUser(otherUser.id)
      }
    })

    it('should refuse the next request after the domain becomes inactive', async () => {
      let ownDomain = null
      let ownUser = null
      try {
        ownDomain = await createTestDomain()
        ownUser = await createTestUser({
          domainId: ownDomain.domain_id,
          role: 'domain_admin'
        })
        const token = await generateToken({
          user: { id: ownUser.id, dr_domain_id: ownDomain.domain_id }
        })
        expect((await getMe(token)).status).toBe(200)
        await dbWrite()('dr_domain')
          .where('id', toBin(ownDomain.domain_id))
          .update({ status: 'inactive' })

        const response = await getMe(token)

        expect(response.status).toBe(401)
        expect(response.body).toEqual(SESSION_EXPIRED)
      } finally {
        if (ownUser) await deleteTestUser(ownUser.id)
        if (ownDomain) await deleteTestDomain(ownDomain.domain_id)
      }
    })

    it('should refuse the next request after the domain is removed', async () => {
      let ownDomain = null
      let ownUser = null
      try {
        ownDomain = await createTestDomain()
        ownUser = await createTestUser({
          domainId: ownDomain.domain_id,
          role: 'user'
        })
        const token = await generateToken({
          user: { id: ownUser.id, dr_domain_id: ownDomain.domain_id }
        })
        expect((await getMe(token)).status).toBe(200)
        await dbWrite()('dr_domain')
          .where('id', toBin(ownDomain.domain_id))
          .update({ status: 'removed' })

        const response = await getMe(token)

        expect(response.status).toBe(401)
        expect(response.body).toEqual(SESSION_EXPIRED)
      } finally {
        if (ownUser) await deleteTestUser(ownUser.id)
        if (ownDomain) await deleteTestDomain(ownDomain.domain_id)
      }
    })
  })

  describe('POST /v2/auth/logout', () => {
    it('should revoke the session on logout', async () => {
      const token = await sharedToken()
      expect((await getMe(token)).status).toBe(200)

      const response = await request(app)
        .post('/v2/auth/logout')
        .set('Authorization', `Bearer ${token}`)

      expect(response.status).toBe(204)
      expect(response.text).toBe('')
      const session = await dbWrite()('active_sessions')
        .where('id', toBin(sessionIdOf(token)))
        .first()
      expect(session.revoked_at).toBeInstanceOf(Date)
      expect(session.revoked_reason).toBe('logout')
      const next = await getMe(token)
      expect(next.status).toBe(401)
      expect(next.body).toEqual(SESSION_EXPIRED)
      const again = await request(app)
        .post('/v2/auth/logout')
        .set('Authorization', `Bearer ${token}`)
      expect(again.status).toBe(401)
    })

    it('should answer 401 to a logout without a token', async () => {
      const response = await request(app).post('/v2/auth/logout')

      expect(response.status).toBe(401)
      expect(response.body).toEqual(SESSION_EXPIRED)
    })
  })
})
