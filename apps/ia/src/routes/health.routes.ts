import { Router } from 'express'
import { live, ready } from '../controllers/health.controller'

const healthRoutes = Router()

healthRoutes.get('/live', live)
healthRoutes.get('/ready', ready)

export default healthRoutes
