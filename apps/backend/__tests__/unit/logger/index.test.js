const loadLogger = config => {
  let logger
  jest.isolateModules(() => {
    jest.doMock('../../../src/config/env', () => ({ config }))
    logger = require('../../../src/logger').default
  })
  return logger
}

// Wraps the real pino so the logger writes to an in-memory destination.
const loadCapturingLogger = config => {
  const lines = []
  const destination = { write: chunk => lines.push(chunk) }
  let loaded
  jest.isolateModules(() => {
    jest.doMock('../../../src/config/env', () => ({ config }))
    jest.doMock('pino', () => {
      const actualPino = jest.requireActual('pino')
      return options => actualPino(options, destination)
    })
    loaded = require('../../../src/logger')
  })
  return { logger: loaded.default, lines }
}

const TOKEN = 'Bearer eyJhbGciOiJIUzI1NiJ9.secret-token-value.signature'
const COOKIE = 'session=secret-cookie-value'
const DEVELOPMENT = { logLevel: 'info', nodeEnv: 'development' }

describe('logger', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  afterEach(() => {
    jest.dontMock('pino')
  })

  it('should use the configured level', () => {
    const logger = loadLogger({ logLevel: 'debug', nodeEnv: 'development' })

    expect(logger.level).toBe('debug')
    expect(logger.isLevelEnabled('debug')).toBe(true)
    expect(logger.isLevelEnabled('trace')).toBe(false)
  })

  it('should be silent when the environment is testing', () => {
    const logger = loadLogger({ logLevel: 'info', nodeEnv: 'testing' })

    expect(logger.isLevelEnabled('fatal')).toBe(false)
  })

  it('should write nothing when the environment is testing', () => {
    const { logger, lines } = loadCapturingLogger({
      logLevel: 'info',
      nodeEnv: 'testing'
    })

    logger.fatal('not written')

    expect(lines).toHaveLength(0)
  })

  it('should redact the Authorization header', () => {
    const { logger, lines } = loadCapturingLogger(DEVELOPMENT)

    logger.info(
      { req: { method: 'GET', headers: { authorization: TOKEN } } },
      'request completed'
    )

    expect(lines).toHaveLength(1)
    expect(lines[0]).not.toContain('secret-token-value')
    const entry = JSON.parse(lines[0])
    expect(entry.req.headers.authorization).toBe('[redacted]')
    expect(entry.req.method).toBe('GET')
    expect(entry.msg).toBe('request completed')
  })

  it('should redact the Authorization header and the cookie in child bindings', () => {
    const { logger, lines } = loadCapturingLogger(DEVELOPMENT)

    // pino-http binds the request to a child logger.
    logger
      .child({
        req: {
          headers: {
            authorization: TOKEN,
            cookie: COOKIE,
            'content-type': 'application/json'
          }
        }
      })
      .info('request completed')

    expect(lines).toHaveLength(1)
    expect(lines[0]).not.toContain('secret-token-value')
    expect(lines[0]).not.toContain('secret-cookie-value')
    const entry = JSON.parse(lines[0])
    expect(entry.req.headers).toEqual({
      authorization: '[redacted]',
      cookie: '[redacted]',
      'content-type': 'application/json'
    })
  })
})
