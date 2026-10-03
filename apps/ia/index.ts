import './loader'
import { createServer } from 'http'
import { assertConfig, config } from './src/config/env'
import logger from './src/logger'
import app from './src/app'

try {
  assertConfig()
} catch (error) {
  process.stderr.write(`${(error as Error).message}\n`)
  process.exit(1)
}

createServer(app).listen(config.port, config.apiHost, () => {
  logger.info(`ia listening on http://${config.apiHost}:${config.port}`)
})
