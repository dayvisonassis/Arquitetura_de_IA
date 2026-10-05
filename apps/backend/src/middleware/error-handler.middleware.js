import logger from '../logger'
import { AppError, MESSAGES } from '../utils/app-error.utils'
import { isDatabaseUnavailable } from '../utils/database-errors.utils'

export const notFound = (_req, res) => {
  res.status(404).json({ message: 'Rota não encontrada.' })
}

export const errorHandler = (error, req, res, next) => {
  if (res.headersSent) {
    next(error)
    return
  }
  if (error.type === 'entity.parse.failed') {
    res.status(400).json({ message: 'JSON inválido.' })
    return
  }
  const log = req.log ?? logger
  if (error instanceof AppError) {
    if (error.status >= 500) {
      log.error({ err: error, requestId: req.id }, 'Request failed')
    }
    res.status(error.status).json({ message: error.message, ...error.extra })
    return
  }
  if (isDatabaseUnavailable(error)) {
    log.error({ err: error, requestId: req.id }, 'Database unavailable')
    res.status(503).json({ message: MESSAGES.serviceUnavailable })
    return
  }
  log.error({ err: error, requestId: req.id }, 'Unhandled error')
  res.status(500).json({ message: 'Erro interno. Tente novamente.' })
}
