const loadLogger = config => {
  let logger
  jest.isolateModules(() => {
    jest.doMock('../../../src/config/env', () => ({ config }))
    logger = require('../../../src/logger').default
  })
  return logger
}

describe('logger', () => {
  beforeEach(() => {
    jest.clearAllMocks()
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
})
