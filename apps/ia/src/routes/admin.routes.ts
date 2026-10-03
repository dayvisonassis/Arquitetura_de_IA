import { Router } from 'express'
import { adminAuth } from '../middleware/admin-auth.middleware'

const adminRoutes = Router()

adminRoutes.use(adminAuth)

export default adminRoutes
