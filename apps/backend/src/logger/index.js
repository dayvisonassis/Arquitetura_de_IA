import pino from 'pino'
import { config } from '../config/env'

const logger = pino({
  level: config.logLevel,
  enabled: config.nodeEnv !== 'testing'
})

export default logger
