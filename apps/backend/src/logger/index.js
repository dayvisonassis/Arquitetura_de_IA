import pino from 'pino'
import { config } from '../config/env'

const logger = pino({
  level: config.logLevel,
  enabled: config.nodeEnv !== 'testing',
  redact: {
    paths: ['req.headers.authorization', 'req.headers.cookie'],
    censor: '[redacted]'
  }
})

export default logger
