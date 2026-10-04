import { Router } from 'express'
import {
  getCatalogView,
  resumeCapability,
  resumeDeployment,
  suspendCapability,
  suspendDeployment
} from '../controllers/catalog.controller'

const catalogRoutes = Router()

catalogRoutes.get('/catalog', getCatalogView)
catalogRoutes.post('/capabilities/:name/suspend', suspendCapability)
catalogRoutes.post('/capabilities/:name/resume', resumeCapability)
catalogRoutes.post('/deployments/:name/suspend', suspendDeployment)
catalogRoutes.post('/deployments/:name/resume', resumeDeployment)

export default catalogRoutes
