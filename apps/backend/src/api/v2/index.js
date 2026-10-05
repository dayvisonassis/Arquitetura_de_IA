import { Router } from 'express'
import { authenticate } from '../../middleware/authentication.middleware'
import authRoutes from './routes/auth.routes'
import meRoutes from './routes/me.routes'

const v2 = Router()

v2.use('/auth', authRoutes)
v2.use(authenticate)
v2.use('/me', meRoutes)

export default v2
