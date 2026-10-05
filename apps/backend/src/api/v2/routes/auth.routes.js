import { Router } from 'express'
import { login, logout } from '../controllers/auth.controller'
import { authenticate } from '../../../middleware/authentication.middleware'
import { loginRateLimit } from '../../../middleware/login-rate-limit.middleware'

const router = Router()

router.post('/login', loginRateLimit, login)
router.post('/logout', authenticate, logout)

export default router
