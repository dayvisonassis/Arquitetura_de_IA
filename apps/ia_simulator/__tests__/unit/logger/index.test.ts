import type { Logger } from 'pino'

const loadLogger = async (config: {
  logLevel: string
  nodeEnv: string
}): Promise<Logger> => {
  let logger: Logger | undefined
  await jest.isolateModulesAsync(async () => {
    jest.doMock('../../../src/config/env', () => ({ config }))
    logger = (await import('../../../src/logger')).default
  })
  return logger as Logger
}

describe('logger', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('should use the configured level', async () => {
    const logger = await loadLogger({
      logLevel: 'debug',
      nodeEnv: 'development'
    })

    expect(logger.level).toBe('debug')
    expect(logger.isLevelEnabled('debug')).toBe(true)
    expect(logger.isLevelEnabled('trace')).toBe(false)
  })

  it('should be silent when the environment is testing', async () => {
    const logger = await loadLogger({ logLevel: 'info', nodeEnv: 'testing' })

    expect(logger.isLevelEnabled('fatal')).toBe(false)
  })
})
