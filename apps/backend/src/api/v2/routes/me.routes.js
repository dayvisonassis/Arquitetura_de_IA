import { Router } from 'express'
import { show } from '../controllers/me.controller'

const router = Router()

router.get('/', show)

export default router
