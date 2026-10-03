import { Router } from 'express'
import { live } from '../controllers/health.controller'

const healthRoutes = Router()

healthRoutes.get('/live', live)

export default healthRoutes
