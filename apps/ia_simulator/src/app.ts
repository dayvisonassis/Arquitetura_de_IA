import express from 'express'
import { errorHandler, notFound } from './middleware/error-handler.middleware'
import healthRoutes from './routes/health.routes'

const app = express()

app.disable('x-powered-by')
app.use(express.json({ limit: '2mb' }))
app.use('/health', healthRoutes)
app.use(notFound)
app.use(errorHandler)

export default app
