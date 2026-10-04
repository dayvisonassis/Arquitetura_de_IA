import { Router } from 'express'
import { createCompletion } from '../controllers/completions.controller'

const completionsRoutes = Router()

completionsRoutes.post('/chat/completions', createCompletion)

export default completionsRoutes
