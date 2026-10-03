// The loader would read the local .env.testing; unit tests build the env by hand.
jest.mock('../../../loader', () => ({}))

import { assertConfig, ConfigError } from '../../../src/config/env'

type EnvModule = typeof import('../../../src/config/env')

const VALID_ENV: Record<string, string> = Object.freeze({
  DB_HOST: '127.0.0.1',
  DB_USER: 'gateway_app',
  DB_PASSWORD: 'db-password-value',
  DB_NAME: 'gateway_test',
  REDIS_HOST: '127.0.0.1',
  REDIS_PASSWORD: 'redis-password-value',
  REDIS_DB: '2',
  GATEWAY_MASTER_KEY: 'm'.repeat(32),
  OPENAI_API_KEY: 'sk-test-fictitious',
  GEMINI_API_KEY: 'gemini-test-fictitious'
})

const without = (name: string): Record<string, string> =>
  Object.fromEntries(Object.entries(VALID_ENV).filter(([key]) => key !== name))

const originalEnv = process.env

const loadModule = async (env: Record<string, string>): Promise<EnvModule> => {
  process.env = { ...env }
  let loaded: EnvModule | undefined
  await jest.isolateModulesAsync(async () => {
    loaded = await import('../../../src/config/env')
  })
  return loaded as EnvModule
}

const errorFor = (env: Record<string, string | undefined>): ConfigError => {
  try {
    assertConfig(env)
  } catch (error) {
    return error as ConfigError
  }
  throw new Error('assertConfig did not throw')
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
      expect(() => assertConfig({ ...VALID_ENV })).not.toThrow()
    })

    it('should read process.env when called without an argument', () => {
      process.env = { ...VALID_ENV, GATEWAY_MASTER_KEY: '' }

      expect(() => assertConfig()).toThrow(
        'Missing or invalid environment variable: GATEWAY_MASTER_KEY'
      )
    })

    it('should report the first missing variable', () => {
      const missing = errorFor(without('GATEWAY_MASTER_KEY'))
      const empty = errorFor({ ...VALID_ENV, GATEWAY_MASTER_KEY: '' })

      expect(missing).toBeInstanceOf(ConfigError)
      expect(missing.message).toBe(
        'Missing or invalid environment variable: GATEWAY_MASTER_KEY'
      )
      expect(empty.message).toBe(missing.message)
      expect(missing.variable).toBe('GATEWAY_MASTER_KEY')
      for (const value of Object.values(VALID_ENV)) {
        expect(missing.message).not.toContain(value)
      }
    })

    it('should report variables in the order of the spec', () => {
      expect(
        errorFor({ ...VALID_ENV, DB_HOST: '', GATEWAY_MASTER_KEY: '' }).variable
      ).toBe('DB_HOST')
    })

    it('should reject a short master key', () => {
      expect(
        errorFor({ ...VALID_ENV, GATEWAY_MASTER_KEY: 'm'.repeat(31) }).variable
      ).toBe('GATEWAY_MASTER_KEY')
    })

    it.each([
      ['OPENAI_API_KEY', ''],
      ['GEMINI_API_KEY', ''],
      ['REDIS_DB', '16'],
      ['REDIS_DB', 'two'],
      ['PORT', '0'],
      ['DB_PORT', '65536'],
      ['REDIS_PORT', 'abc'],
      ['LOG_LEVEL', 'verbose']
    ])('should reject %s=%s', (name, value) => {
      expect(errorFor({ ...VALID_ENV, [name]: value }).variable).toBe(name)
    })

    it('should accept valid optional values', () => {
      expect(() =>
        assertConfig({
          ...VALID_ENV,
          PORT: '8080',
          DB_PORT: '3307',
          REDIS_PORT: '6380',
          LOG_LEVEL: 'debug'
        })
      ).not.toThrow()
    })
  })

  describe('config', () => {
    it('should apply the defaults for the non-secret variables', async () => {
      const { config } = await loadModule(VALID_ENV)

      expect(config).toMatchObject({
        nodeEnv: 'development',
        port: 3131,
        apiHost: '127.0.0.1',
        logLevel: 'info',
        db: { port: 3306 },
        redis: { port: 6379, db: 2 }
      })
    })

    it('should read the values from the environment', async () => {
      const { config } = await loadModule({
        ...VALID_ENV,
        NODE_ENV: 'testing',
        PORT: '4131',
        API_HOST: '0.0.0.0',
        LOG_LEVEL: 'error',
        DB_PORT: '3307',
        REDIS_PORT: '6380'
      })

      expect(config).toEqual({
        nodeEnv: 'testing',
        port: 4131,
        apiHost: '0.0.0.0',
        logLevel: 'error',
        db: {
          host: '127.0.0.1',
          port: 3307,
          user: 'gateway_app',
          password: 'db-password-value',
          database: 'gateway_test'
        },
        redis: {
          host: '127.0.0.1',
          port: 6380,
          password: 'redis-password-value',
          db: 2
        },
        masterKey: 'm'.repeat(32),
        providers: {
          openaiApiKey: 'sk-test-fictitious',
          geminiApiKey: 'gemini-test-fictitious'
        }
      })
    })

    it('should fall back to info for an unknown log level and to 0 without REDIS_DB', async () => {
      const { config } = await loadModule({
        ...without('REDIS_DB'),
        LOG_LEVEL: 'verbose'
      })

      expect(config.logLevel).toBe('info')
      expect(config.redis.db).toBe(0)
    })

    it('should be frozen', async () => {
      const { config } = await loadModule(VALID_ENV)

      expect(Object.isFrozen(config)).toBe(true)
      expect(Object.isFrozen(config.db)).toBe(true)
      expect(Object.isFrozen(config.providers)).toBe(true)
    })
  })
})
