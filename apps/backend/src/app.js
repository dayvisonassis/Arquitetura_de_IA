import express from 'express'
import pinoHttp from 'pino-http'
import logger from './logger'
import { requestId } from './middleware/request-id.middleware'
import { corsMiddleware } from './middleware/cors.middleware'
import { errorHandler, notFound } from './middleware/error-handler.middleware'
import healthRoutes from './routes/health.routes'
import v2 from './api/v2'

const app = express()

app.disable('x-powered-by')
app.use(requestId)
app.use(
  pinoHttp({
    logger,
    autoLogging: { ignore: req => req.url.startsWith('/health') }
  })
)
app.use(corsMiddleware)
app.use(express.json())
app.use('/health', healthRoutes)
app.use('/v2', v2)
app.use(notFound)
app.use(errorHandler)

module.exports = app
