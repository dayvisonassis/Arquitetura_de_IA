import { Router } from 'express'
import { adminAuth } from '../middleware/admin-auth.middleware'
import catalogRoutes from './catalog.routes'

const adminRoutes = Router()

adminRoutes.use(adminAuth)
adminRoutes.use(catalogRoutes)

export default adminRoutes
