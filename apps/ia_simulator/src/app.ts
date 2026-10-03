import express from 'express'
import healthRoutes from './routes/health.routes'

const app = express()

app.disable('x-powered-by')
app.use(express.json())
app.use('/health', healthRoutes)

export default app
