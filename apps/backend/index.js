import './loader'
import { createServer } from 'http'
import { assertConfig, config } from './src/config/env'
import logger from './src/logger'
import app from './src/app'
import { ensurePlatformAdmin } from './src/services/platform-admin-bootstrap.service'

const fail = error => {
  process.stderr.write(`${error.message}\n`)
  process.exit(1)
}

try {
  assertConfig()
} catch (error) {
  fail(error)
}

ensurePlatformAdmin(config.platformAdmin)
  .then(() => {
    createServer(app).listen(config.port, config.apiHost, () => {
      logger.info(
        `backend listening on http://${config.apiHost}:${config.port}`
      )
    })
  })
  .catch(fail)
