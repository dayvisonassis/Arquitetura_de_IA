import express from 'express'
import pinoHttp from 'pino-http'
import logger from './logger'
import { requestId } from './middleware/request-id.middleware'
import { errorHandler, notFound } from './middleware/error-handler.middleware'
import adminRoutes from './routes/admin.routes'
import healthRoutes from './routes/health.routes'

const app = express()

app.disable('x-powered-by')
app.use(requestId)
app.use(
  pinoHttp({
    logger,
    autoLogging: { ignore: req => String(req.url).startsWith('/health') }
  })
)
app.use(express.json())
app.use('/health', healthRoutes)
app.use('/admin', adminRoutes)
app.use(notFound)
app.use(errorHandler)

export default app
