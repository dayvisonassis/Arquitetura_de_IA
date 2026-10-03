// The loader would read a local .env file; unit tests build the env by hand.
jest.mock('../../../loader', () => ({}))

import { assertConfig, ConfigError } from '../../../src/config/env'

type EnvModule = typeof import('../../../src/config/env')

const originalEnv = process.env

const loadModule = async (env: Record<string, string>): Promise<EnvModule> => {
  process.env = { ...env }
  let loaded: EnvModule | undefined
  await jest.isolateModulesAsync(async () => {
    loaded = await import('../../../src/config/env')
  })
  return loaded as EnvModule
}

describe('config/env', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  afterEach(() => {
    process.env = originalEnv
  })

  describe('assertConfig', () => {
    it('should accept an empty environment, since nothing is required', () => {
      expect(() => assertConfig({})).not.toThrow()
    })

    it('should read process.env when called without an argument', () => {
      process.env = { LOG_LEVEL: 'loud' }

      expect(() => assertConfig()).toThrow(
        'Missing or invalid environment variable: LOG_LEVEL'
      )
    })

    it.each([
      ['PORT', '0'],
      ['PORT', '65536'],
      ['PORT', 'http'],
      ['LOG_LEVEL', 'verbose']
    ])('should reject %s=%s with its name only', (name, value) => {
      let error: unknown
      try {
        assertConfig({ [name]: value })
      } catch (thrown) {
        error = thrown
      }

      expect(error).toBeInstanceOf(ConfigError)
      expect((error as ConfigError).variable).toBe(name)
      expect((error as ConfigError).message).not.toContain(value)
    })

    it('should accept valid values', () => {
      expect(() =>
        assertConfig({ PORT: '3132', API_HOST: '0.0.0.0', LOG_LEVEL: 'warn' })
      ).not.toThrow()
    })
  })

  describe('config', () => {
    it('should apply the defaults', async () => {
      const { config } = await loadModule({})

      expect(config).toEqual({
        nodeEnv: 'development',
        port: 3132,
        apiHost: '127.0.0.1',
        logLevel: 'info'
      })
    })

    it('should read the values from the environment', async () => {
      const { config } = await loadModule({
        NODE_ENV: 'testing',
        PORT: '4132',
        API_HOST: '0.0.0.0',
        LOG_LEVEL: 'debug'
      })

      expect(config).toEqual({
        nodeEnv: 'testing',
        port: 4132,
        apiHost: '0.0.0.0',
        logLevel: 'debug'
      })
    })

    it('should fall back to info for an unknown log level and be frozen', async () => {
      const { config } = await loadModule({ LOG_LEVEL: 'verbose' })

      expect(config.logLevel).toBe('info')
      expect(Object.isFrozen(config)).toBe(true)
    })
  })
})
