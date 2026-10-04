import { Router } from 'express'
import {
  getModes,
  getStatsHandler,
  resetHandler,
  setModeHandler
} from '../controllers/control.controller'

const controlRoutes = Router()

controlRoutes.get('/modes', getModes)
controlRoutes.post('/modes', setModeHandler)
controlRoutes.get('/stats', getStatsHandler)
controlRoutes.post('/reset', resetHandler)

export default controlRoutes
