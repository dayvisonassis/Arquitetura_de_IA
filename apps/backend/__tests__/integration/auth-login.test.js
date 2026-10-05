const { randomUUID } = require('crypto')
const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken')
const request = require('supertest')
const app = require('../../src/app')
const { config } = require('../../src/config/env')
const { resetLoginRateLimit } = require('../utils/auth')
const {
  setupTestDatabase,
  cleanupTestDatabase
} = require('../utils/test-setup')
const {
  TEST_PASSWORD,
  createTestDomain,
  createTestPlatformUser,
  createTestUser,
  deleteTestDomain,
  deleteTestPlatformUser,
  deleteTestUser
} = require('../utils/permission-helper')

const SESSION_MS = 8 * 60 * 60 * 1000
const LOCK_MS = 15 * 60 * 1000
const WRONG_PASSWORD = 'Wrong-password-01'
const INVALID_CREDENTIALS = { message: 'E-mail ou senha inválidos.' }
const BAD_REQUEST = { message: 'Informe o e-mail e a senha.' }
const DOMAIN_INACTIVE = {
  message:
    'O domínio da sua conta está desativado. Fale com o administrador da plataforma.'
}
const TOO_MANY_ATTEMPTS = {
  message: 'Muitas tentativas de login. Tente novamente em alguns minutos.'
}

const toBin = uuid => Buffer.from(uuid.replace(/-/g, ''), 'hex')
const toSecond = time => Math.floor(time / 1000) * 1000
const unknownEmail = () => `nobody-${randomUUID().slice(0, 8)}@example.test`

// Independent oracle for the HH:MM of the lock message (spec §5).
const saoPauloClock = date =>
  new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  }).format(date)

describe('Auth login API', () => {
  let db, domain
  const dbWrite = () => db.getDb({ operation: 'write' })

  const login = body => request(app).post('/v2/auth/login').send(body)

  const readUser = id =>
    dbWrite()('users')
      .select(
        'password_hash',
        'failed_attempts',
        'locked_until',
        'last_login_at'
      )
      .where('id', toBin(id))
      .first()

  const countSessions = async column => {
    const [row] = await dbWrite()('active_sessions')
      .count({ total: '*' })
      .where(column)
    return Number(row.total)
  }

  const readSession = sessionId =>
    dbWrite()('active_sessions').where('id', toBin(sessionId)).first()

  beforeAll(async () => {
    ;({ db, domain } = await setupTestDatabase())
  })

  beforeEach(async () => {
    await resetLoginRateLimit()
  })

  afterAll(async () => {
    try {
      await resetLoginRateLimit()
    } finally {
      await cleanupTestDatabase()
    }
  })

  describe('POST /v2/auth/login', () => {
    it('should log in each identity and create a session', async () => {
      let platformUser = null
      let domainUser = null
      try {
        platformUser = await createTestPlatformUser()
        domainUser = await createTestUser({
          domainId: domain.domain_id,
          role: 'user'
        })
        const cases = [
          {
            account: platformUser,
            tokenUser: { id: platformUser.id, type: 'platform' },
            owner: { platform_user_id: toBin(platformUser.id), user_id: null }
          },
          {
            account: domainUser,
            tokenUser: {
              id: domainUser.id,
              type: 'domain',
              dr_domain_id: domain.domain_id
            },
            owner: { platform_user_id: null, user_id: toBin(domainUser.id) }
          }
        ]

        for (const { account, tokenUser, owner } of cases) {
          const before = Date.now()
          const response = await login({
            email: account.email,
            password: TEST_PASSWORD
          })
          const after = Date.now()

          expect(response.status).toBe(200)
          expect(response.headers['cache-control']).toBe('no-store')
          expect(Object.keys(response.body).sort()).toEqual([
            'expires_at',
            'token'
          ])
          const expiresAt = new Date(response.body.expires_at)
          expect(response.body.expires_at).toMatch(/\.000Z$/)
          expect(expiresAt.getTime()).toBeGreaterThanOrEqual(
            toSecond(before + SESSION_MS)
          )
          expect(expiresAt.getTime()).toBeLessThanOrEqual(
            toSecond(after + SESSION_MS)
          )
          const payload = jwt.verify(response.body.token, config.jwtSecret, {
            algorithms: ['HS256']
          })
          expect(payload.data.user).toEqual(tokenUser)
          expect(payload.exp).toBe(expiresAt.getTime() / 1000)
          const session = await readSession(payload.data.session_id)
          expect(session).toMatchObject(owner)
          expect(session.expires_at.getTime()).toBe(expiresAt.getTime())
          expect(session.revoked_at).toBeNull()
        }
        const account = await readUser(domainUser.id)
        expect(account.failed_attempts).toBe(0)
        expect(account.last_login_at).toBeInstanceOf(Date)
      } finally {
        if (domainUser) await deleteTestUser(domainUser.id)
        if (platformUser) await deleteTestPlatformUser(platformUser.id)
      }
    })

    it('should compare the e-mail case-insensitively and without surrounding spaces', async () => {
      let domainUser = null
      try {
        domainUser = await createTestUser({
          domainId: domain.domain_id,
          role: 'user'
        })

        const response = await login({
          email: `  ${domainUser.email.toUpperCase()}  `,
          password: TEST_PASSWORD
        })

        expect(response.status).toBe(200)
        expect(response.body).toHaveProperty('token')
        const payload = jwt.decode(response.body.token)
        expect(payload.data.user.id).toBe(domainUser.id)
        expect(await countSessions({ user_id: toBin(domainUser.id) })).toBe(1)
      } finally {
        if (domainUser) await deleteTestUser(domainUser.id)
      }
    })

    it('should store the password as a bcrypt hash of cost 10', async () => {
      let domainUser = null
      try {
        domainUser = await createTestUser({
          domainId: domain.domain_id,
          role: 'user'
        })
        const stored = await readUser(domainUser.id)

        const response = await login({
          email: domainUser.email,
          password: TEST_PASSWORD
        })

        expect(response.status).toBe(200)
        const afterLogin = await readUser(domainUser.id)
        expect(afterLogin.password_hash).toMatch(
          /^\$2b\$10\$[./A-Za-z0-9]{53}$/
        )
        expect(bcrypt.getRounds(afterLogin.password_hash)).toBe(10)
        expect(afterLogin.password_hash).toBe(stored.password_hash)
        expect(afterLogin.password_hash).not.toContain(TEST_PASSWORD)
        expect(JSON.stringify(response.body)).not.toContain(TEST_PASSWORD)
      } finally {
        if (domainUser) await deleteTestUser(domainUser.id)
      }
    })

    it('should answer the same 401 for a wrong password and an unknown e-mail', async () => {
      let domainUser = null
      try {
        domainUser = await createTestUser({
          domainId: domain.domain_id,
          role: 'user'
        })

        const wrongPassword = await login({
          email: domainUser.email,
          password: WRONG_PASSWORD
        })
        const unknownAccount = await login({
          email: unknownEmail(),
          password: WRONG_PASSWORD
        })

        expect(wrongPassword.status).toBe(401)
        expect(unknownAccount.status).toBe(401)
        expect(wrongPassword.body).toEqual(INVALID_CREDENTIALS)
        expect(unknownAccount.body).toEqual(wrongPassword.body)
        expect((await readUser(domainUser.id)).failed_attempts).toBe(1)
        expect(await countSessions({ user_id: toBin(domainUser.id) })).toBe(0)
      } finally {
        if (domainUser) await deleteTestUser(domainUser.id)
      }
    })

    it('should refuse a password over 72 bytes at login as a wrong password', async () => {
      let domainUser = null
      try {
        domainUser = await createTestUser({
          domainId: domain.domain_id,
          role: 'user'
        })
        // bcrypt truncates at 72 bytes: a hash of these 36 "ç" (72 bytes) would
        // accept the 40 "ç" (80 bytes) below if the login compared them.
        await dbWrite()('users')
          .where('id', toBin(domainUser.id))
          .update({ password_hash: await bcrypt.hash('ç'.repeat(36), 10) })
        const password = 'ç'.repeat(40)
        expect([...password]).toHaveLength(40)
        expect(Buffer.byteLength(password, 'utf8')).toBe(80)

        const response = await login({ email: domainUser.email, password })

        expect(response.status).toBe(401)
        expect(response.body).toEqual(INVALID_CREDENTIALS)
        expect((await readUser(domainUser.id)).failed_attempts).toBe(1)
        expect(await countSessions({ user_id: toBin(domainUser.id) })).toBe(0)
      } finally {
        if (domainUser) await deleteTestUser(domainUser.id)
      }
    })

    it('should lock on the fifth consecutive failure even for the right password', async () => {
      let domainUser = null
      try {
        domainUser = await createTestUser({
          domainId: domain.domain_id,
          role: 'user'
        })
        const wrong = () =>
          login({ email: domainUser.email, password: WRONG_PASSWORD })

        for (let failure = 1; failure <= 4; failure++) {
          const response = await wrong()
          expect(response.status).toBe(401)
          expect((await readUser(domainUser.id)).failed_attempts).toBe(failure)
        }
        const before = Date.now()
        const fifth = await wrong()
        const after = Date.now()
        const sixth = await login({
          email: domainUser.email,
          password: TEST_PASSWORD
        })

        expect(fifth.status).toBe(423)
        const lockedUntil = new Date(fifth.body.locked_until)
        expect(lockedUntil.getTime()).toBeGreaterThanOrEqual(before + LOCK_MS)
        expect(lockedUntil.getTime()).toBeLessThanOrEqual(after + LOCK_MS)
        expect(fifth.body).toEqual({
          message: `Conta bloqueada por 15 minutos após várias tentativas. Tente novamente às ${saoPauloClock(lockedUntil)}.`,
          locked_until: lockedUntil.toISOString()
        })
        expect(fifth.body.message).toMatch(/às \d{2}:\d{2}\.$/)
        expect(sixth.status).toBe(423)
        expect(sixth.body).toEqual(fifth.body)
        const account = await readUser(domainUser.id)
        expect(account.failed_attempts).toBe(0)
        expect(account.locked_until.getTime()).toBe(lockedUntil.getTime())
        expect(await countSessions({ user_id: toBin(domainUser.id) })).toBe(0)
      } finally {
        if (domainUser) await deleteTestUser(domainUser.id)
      }
    })

    it('should let the user in after the lock expires', async () => {
      let domainUser = null
      try {
        domainUser = await createTestUser({
          domainId: domain.domain_id,
          role: 'user'
        })
        await dbWrite()('users')
          .where('id', toBin(domainUser.id))
          .update({
            failed_attempts: 2,
            locked_until: new Date(Date.now() - 60 * 1000)
          })

        const response = await login({
          email: domainUser.email,
          password: TEST_PASSWORD
        })

        expect(response.status).toBe(200)
        expect(response.body).toHaveProperty('token')
        const account = await readUser(domainUser.id)
        expect(account.failed_attempts).toBe(0)
        expect(account.locked_until).toBeNull()
        expect(account.last_login_at).toBeInstanceOf(Date)
        expect(await countSessions({ user_id: toBin(domainUser.id) })).toBe(1)
      } finally {
        if (domainUser) await deleteTestUser(domainUser.id)
      }
    })

    it('should refuse the login of a user whose domain is inactive or removed', async () => {
      const domains = []
      const users = []
      try {
        for (const status of ['inactive', 'removed']) {
          const created = await createTestDomain({ status })
          domains.push(created)
          const domainUser = await createTestUser({
            domainId: created.domain_id,
            role: 'user'
          })
          users.push(domainUser)
          await dbWrite()('users')
            .where('id', toBin(domainUser.id))
            .update({ failed_attempts: 2 })
        }

        for (const domainUser of users) {
          const response = await login({
            email: domainUser.email,
            password: TEST_PASSWORD
          })

          expect(response.status).toBe(403)
          expect(response.body).toEqual(DOMAIN_INACTIVE)
          expect((await readUser(domainUser.id)).failed_attempts).toBe(0)
          expect(await countSessions({ user_id: toBin(domainUser.id) })).toBe(0)
        }
      } finally {
        for (const domainUser of users) await deleteTestUser(domainUser.id)
        for (const created of domains) await deleteTestDomain(created.domain_id)
      }
    })

    it.each([
      ['an empty body', {}],
      ['a body without password', { email: 'someone@example.test' }],
      ['a body without e-mail', { password: 'Some-password-01' }],
      ['a non-string e-mail', { email: 123, password: 'Some-password-01' }],
      ['a non-string password', { email: 'someone@example.test', password: 1 }],
      ['an empty password', { email: 'someone@example.test', password: '' }],
      ['an e-mail of only spaces', { email: '   ', password: 'Some-pass-01' }],
      [
        'an e-mail over 254 characters',
        { email: `${'a'.repeat(250)}@example.test`, password: 'Some-pass-01' }
      ]
    ])('should answer 400 to %s', async (_label, body) => {
      const response = await login(body)

      expect(response.status).toBe(400)
      expect(response.body).toEqual(BAD_REQUEST)
    })

    it('should answer 400 to an invalid JSON body', async () => {
      const response = await request(app)
        .post('/v2/auth/login')
        .set('Content-Type', 'application/json')
        .send('{"email": "someone@example.test", "password": ')

      expect(response.status).toBe(400)
      expect(response.body).toEqual({ message: 'JSON inválido.' })
    })

    it('should answer 429 on the 21st attempt from the same IP', async () => {
      const { max } = config.loginRateLimit
      const statuses = []

      for (let attempt = 0; attempt < max; attempt++) {
        const response = await login({
          email: unknownEmail(),
          password: WRONG_PASSWORD
        })
        statuses.push(response.status)
      }
      const blocked = await login({
        email: unknownEmail(),
        password: WRONG_PASSWORD
      })

      expect(statuses).toHaveLength(max)
      expect(statuses).not.toContain(429)
      expect(blocked.status).toBe(429)
      expect(blocked.body).toEqual(TOO_MANY_ATTEMPTS)
      expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0)
    })
  })
})
