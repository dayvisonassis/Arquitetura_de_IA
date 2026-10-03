import { Router } from 'express'
import { live, ready } from '../controllers/health.controller'

const router = Router()

router.get('/live', live)
router.get('/ready', ready)

export default router
