// The loader would read the local .env.testing; unit tests build the env by hand.
jest.mock('../../../loader', () => ({}))

const VALID_ENV = Object.freeze({
  DB_HOST: '127.0.0.1',
  DB_USER: 'web_app',
  DB_PASSWORD: 'db-password-value',
  DB_NAME: 'web_test',
  REDIS_HOST: '127.0.0.1',
  REDIS_PASSWORD: 'redis-password-value',
  REDIS_DB: '3',
  GATEWAY_URL: 'http://127.0.0.1:3131',
  GATEWAY_MASTER_KEY: 'm'.repeat(32),
  JWT_SECRET: 'j'.repeat(32),
  KEY_ENCRYPTION_KEY: 'a'.repeat(64),
  PLATFORM_ADMIN_EMAIL: 'admin@example.test',
  PLATFORM_ADMIN_PASSWORD: 'admin-password-value'
})

const originalEnv = process.env

const loadModule = env => {
  process.env = { ...env }
  let loaded
  jest.isolateModules(() => {
    loaded = require('../../../src/config/env')
  })
  return loaded
}

const errorFor = (assertConfig, env) => {
  try {
    assertConfig(env)
  } catch (error) {
    return error
  }
  return null
}

describe('config/env', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  afterEach(() => {
    process.env = originalEnv
  })

  describe('assertConfig', () => {
    it('should accept a complete environment with the optional variables absent', () => {
      const { assertConfig } = loadModule(VALID_ENV)

      expect(() => assertConfig({ ...VALID_ENV })).not.toThrow()
    })

    it('should read process.env when called without an argument', () => {
      const { assertConfig } = loadModule({
        ...VALID_ENV,
        GATEWAY_MASTER_KEY: ''
      })

      expect(() => assertConfig()).toThrow(
        'Missing or invalid environment variable: GATEWAY_MASTER_KEY'
      )
    })

    it('should report the first missing variable', () => {
      const { assertConfig } = loadModule(VALID_ENV)
      const { GATEWAY_MASTER_KEY: _removed, ...withoutKey } = VALID_ENV

      const missing = errorFor(assertConfig, withoutKey)
      const empty = errorFor(assertConfig, {
        ...VALID_ENV,
        GATEWAY_MASTER_KEY: ''
      })

      expect(missing.message).toBe(
        'Missing or invalid environment variable: GATEWAY_MASTER_KEY'
      )
      expect(empty.message).toBe(missing.message)
      expect(missing.variable).toBe('GATEWAY_MASTER_KEY')
      expect(missing.reason).toBeNull()
      expect(empty.reason).toBeNull()
      for (const value of Object.values(VALID_ENV)) {
        expect(missing.message).not.toContain(value)
      }
    })

    it('should report variables in the order of the spec', () => {
      const { assertConfig } = loadModule(VALID_ENV)

      const error = errorFor(assertConfig, {
        ...VALID_ENV,
        DB_HOST: '',
        GATEWAY_MASTER_KEY: ''
      })

      expect(error.variable).toBe('DB_HOST')
    })

    it('should reject a short master key or JWT secret', () => {
      const { assertConfig } = loadModule(VALID_ENV)

      expect(
        errorFor(assertConfig, {
          ...VALID_ENV,
          GATEWAY_MASTER_KEY: 'm'.repeat(31)
        }).variable
      ).toBe('GATEWAY_MASTER_KEY')
      expect(
        errorFor(assertConfig, { ...VALID_ENV, JWT_SECRET: 'j'.repeat(31) })
          .variable
      ).toBe('JWT_SECRET')
    })

    it('should reject a malformed KEY_ENCRYPTION_KEY', () => {
      const { assertConfig } = loadModule(VALID_ENV)
      const malformed = ['a'.repeat(63), `${'a'.repeat(63)}g`, 'a'.repeat(65)]

      for (const value of malformed) {
        const error = errorFor(assertConfig, {
          ...VALID_ENV,
          KEY_ENCRYPTION_KEY: value
        })
        expect(error.variable).toBe('KEY_ENCRYPTION_KEY')
        expect(error.message).not.toContain(value)
      }
    })

    it.each([
      ['REDIS_DB', '16'],
      ['REDIS_DB', 'one'],
      ['GATEWAY_URL', 'not a url'],
      ['GATEWAY_URL', 'ftp://127.0.0.1'],
      ['FRONTEND_ORIGIN', 'localhost:4200'],
      ['GATEWAY_TIMEOUT_MS', '0'],
      ['PORT', '70000'],
      ['DB_PORT', 'abc'],
      ['REDIS_PORT', '0'],
      ['LOG_LEVEL', 'verbose'],
      ['LOGIN_RATE_LIMIT_MAX', '0'],
      ['LOGIN_RATE_LIMIT_MAX', '10001'],
      ['LOGIN_RATE_LIMIT_MAX', '-1'],
      ['LOGIN_RATE_LIMIT_MAX', '1.5'],
      ['LOGIN_RATE_LIMIT_MAX', 'twenty']
    ])('should reject %s=%s', (name, value) => {
      const { assertConfig } = loadModule(VALID_ENV)

      const error = errorFor(assertConfig, { ...VALID_ENV, [name]: value })

      expect(error.variable).toBe(name)
      // Variables without a content rule keep the message without a reason.
      expect(error.reason).toBeNull()
      expect(error.message).toBe(
        `Missing or invalid environment variable: ${name}`
      )
    })

    it('should accept valid optional values', () => {
      const { assertConfig } = loadModule(VALID_ENV)

      expect(() =>
        assertConfig({
          ...VALID_ENV,
          PORT: '8080',
          FRONTEND_ORIGIN: 'https://app.example.test',
          GATEWAY_TIMEOUT_MS: '2500',
          LOG_LEVEL: 'debug',
          KEY_ENCRYPTION_KEY: 'AbCdEf0123456789'.repeat(4),
          LOGIN_RATE_LIMIT_MAX: '200'
        })
      ).not.toThrow()
    })

    it.each(['1', '10000'])('should accept LOGIN_RATE_LIMIT_MAX=%s', value => {
      const { assertConfig } = loadModule(VALID_ENV)

      expect(() =>
        assertConfig({ ...VALID_ENV, LOGIN_RATE_LIMIT_MAX: value })
      ).not.toThrow()
    })

    describe('platform admin', () => {
      it('should reject a platform admin password shorter than 10 characters', () => {
        const { assertConfig } = loadModule(VALID_ENV)
        const password = 'short-pw9'

        const error = errorFor(assertConfig, {
          ...VALID_ENV,
          PLATFORM_ADMIN_PASSWORD: password
        })

        expect(error.name).toBe('ConfigError')
        expect(error.variable).toBe('PLATFORM_ADMIN_PASSWORD')
        expect(error.reason).toBe('must have at least 10 characters')
        expect(error.message).toBe(
          'Missing or invalid environment variable: PLATFORM_ADMIN_PASSWORD (must have at least 10 characters)'
        )
        expect(error.message).not.toContain(password)
      })

      it.each([
        [
          'longer than 64 characters',
          'p'.repeat(65),
          'must have at most 64 characters'
        ],
        [
          'of 64 characters or less over 72 bytes',
          'ç'.repeat(40),
          'must have at most 72 bytes in UTF-8'
        ]
      ])(
        'should reject a platform admin password %s',
        (_case, password, reason) => {
          const { assertConfig } = loadModule(VALID_ENV)

          const error = errorFor(assertConfig, {
            ...VALID_ENV,
            PLATFORM_ADMIN_PASSWORD: password
          })

          expect(error.variable).toBe('PLATFORM_ADMIN_PASSWORD')
          expect(error.reason).toBe(reason)
          expect(error.message).toBe(
            `Missing or invalid environment variable: PLATFORM_ADMIN_PASSWORD (${reason})`
          )
          expect(error.message).not.toContain(password)
        }
      )

      it.each([
        ['malformed', 'not-an-email'],
        ['longer than 254 characters', `${'a'.repeat(242)}@example.test`]
      ])('should reject a %s platform admin e-mail', (_case, email) => {
        const { assertConfig } = loadModule(VALID_ENV)

        const error = errorFor(assertConfig, {
          ...VALID_ENV,
          PLATFORM_ADMIN_EMAIL: email
        })

        expect(error.variable).toBe('PLATFORM_ADMIN_EMAIL')
        expect(error.reason).toBe('must be a valid e-mail up to 254 characters')
        expect(error.message).toBe(
          'Missing or invalid environment variable: PLATFORM_ADMIN_EMAIL (must be a valid e-mail up to 254 characters)'
        )
      })

      it.each(['PLATFORM_ADMIN_EMAIL', 'PLATFORM_ADMIN_PASSWORD'])(
        'should report a missing %s without a reason',
        name => {
          const { assertConfig } = loadModule(VALID_ENV)
          const { [name]: _removed, ...withoutVariable } = VALID_ENV

          const missing = errorFor(assertConfig, withoutVariable)
          const empty = errorFor(assertConfig, { ...VALID_ENV, [name]: '' })

          for (const error of [missing, empty]) {
            expect(error.variable).toBe(name)
            expect(error.reason).toBeNull()
            expect(error.message).toBe(
              `Missing or invalid environment variable: ${name}`
            )
          }
        }
      )

      it('should report the e-mail before the password', () => {
        const { assertConfig } = loadModule(VALID_ENV)

        const error = errorFor(assertConfig, {
          ...VALID_ENV,
          PLATFORM_ADMIN_EMAIL: 'not-an-email',
          PLATFORM_ADMIN_PASSWORD: 'short'
        })

        expect(error.variable).toBe('PLATFORM_ADMIN_EMAIL')
      })

      it('should accept the limits of the password and e-mail rules', () => {
        const { assertConfig } = loadModule(VALID_ENV)
        const accepted = [
          { PLATFORM_ADMIN_PASSWORD: 'p'.repeat(10) },
          { PLATFORM_ADMIN_PASSWORD: 'p'.repeat(64) },
          { PLATFORM_ADMIN_PASSWORD: 'ç'.repeat(36) },
          { PLATFORM_ADMIN_EMAIL: `${'a'.repeat(241)}@example.test` },
          { PLATFORM_ADMIN_EMAIL: '  Admin@Example.TEST  ' }
        ]

        for (const values of accepted) {
          expect(() => assertConfig({ ...VALID_ENV, ...values })).not.toThrow()
        }
      })
    })
  })

  describe('config', () => {
    it('should apply the defaults for the non-secret variables', () => {
      const { config } = loadModule(VALID_ENV)

      expect(config).toMatchObject({
        nodeEnv: 'development',
        port: 3030,
        apiHost: '127.0.0.1',
        frontendOrigin: 'http://127.0.0.1:4200',
        logLevel: 'info',
        db: { port: 3306 },
        redis: { port: 6379 },
        gateway: { timeoutMs: 10000 },
        loginRateLimit: { max: 20, windowMs: 900000 }
      })
    })

    it('should read the values from the environment', () => {
      const { config } = loadModule({
        ...VALID_ENV,
        NODE_ENV: 'testing',
        PORT: '4000',
        API_HOST: '0.0.0.0',
        FRONTEND_ORIGIN: 'http://127.0.0.1:4300',
        LOG_LEVEL: 'warn',
        DB_PORT: '3307',
        REDIS_PORT: '6380',
        GATEWAY_TIMEOUT_MS: '5000',
        LOGIN_RATE_LIMIT_MAX: '50'
      })

      expect(config).toEqual({
        nodeEnv: 'testing',
        port: 4000,
        apiHost: '0.0.0.0',
        frontendOrigin: 'http://127.0.0.1:4300',
        logLevel: 'warn',
        db: {
          host: '127.0.0.1',
          port: 3307,
          user: 'web_app',
          password: 'db-password-value',
          database: 'web_test'
        },
        redis: {
          host: '127.0.0.1',
          port: 6380,
          password: 'redis-password-value',
          db: 3
        },
        gateway: {
          url: 'http://127.0.0.1:3131',
          timeoutMs: 5000,
          masterKey: 'm'.repeat(32)
        },
        jwtSecret: 'j'.repeat(32),
        keyEncryptionKey: 'a'.repeat(64),
        platformAdmin: {
          email: 'admin@example.test',
          password: 'admin-password-value'
        },
        loginRateLimit: { max: 50, windowMs: 900000 }
      })
    })

    it('should treat empty values as absent and fall back to info for an unknown log level', () => {
      const { config } = loadModule({
        ...VALID_ENV,
        PORT: '',
        LOG_LEVEL: 'verbose',
        LOGIN_RATE_LIMIT_MAX: ''
      })

      expect(config.port).toBe(3030)
      expect(config.logLevel).toBe('info')
      expect(config.loginRateLimit.max).toBe(20)
    })

    it('should be frozen', () => {
      const { config } = loadModule(VALID_ENV)

      expect(Object.isFrozen(config)).toBe(true)
      expect(Object.isFrozen(config.db)).toBe(true)
      expect(Object.isFrozen(config.gateway)).toBe(true)
      expect(Object.isFrozen(config.platformAdmin)).toBe(true)
      expect(Object.isFrozen(config.loginRateLimit)).toBe(true)
    })
  })
})
