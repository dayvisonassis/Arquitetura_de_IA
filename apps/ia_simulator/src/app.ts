import express from 'express'
import { errorHandler, notFound } from './middleware/error-handler.middleware'
import completionsRoutes from './routes/completions.routes'
import controlRoutes from './routes/control.routes'
import healthRoutes from './routes/health.routes'

const app = express()

app.disable('x-powered-by')
app.use(express.json({ limit: '2mb' }))
app.use('/health', healthRoutes)
app.use('/v1', completionsRoutes)
app.use('/control', controlRoutes)
app.use(notFound)
app.use(errorHandler)

export default app
