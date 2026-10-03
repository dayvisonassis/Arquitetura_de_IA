import logger from '../logger'

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
  log.error({ err: error, requestId: req.id }, 'Unhandled error')
  res.status(500).json({ message: 'Erro interno. Tente novamente.' })
}
