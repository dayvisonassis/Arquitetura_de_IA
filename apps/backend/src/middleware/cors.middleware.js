import cors from 'cors'
import { config } from '../config/env'

const allowFrontend = cors({
  origin: config.frontendOrigin,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Authorization', 'Content-Type', 'x-request-id'],
  exposedHeaders: ['x-request-id'],
  optionsSuccessStatus: 204
})

export const corsMiddleware = (req, res, next) => {
  const origin = req.get('origin')
  if (origin === undefined) {
    next()
    return
  }
  if (origin !== config.frontendOrigin) {
    res.status(403).json({ message: 'Origem não permitida.' })
    return
  }
  allowFrontend(req, res, next)
}
