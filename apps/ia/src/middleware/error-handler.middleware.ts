import type { NextFunction, Request, Response } from 'express'
import logger from '../logger'
import { sendApiError } from '../lib/api-error'

type HttpError = Error & { type?: string }

export const notFound = (_req: Request, res: Response): void => {
  sendApiError(res, 404, 'not_found', 'Rota não encontrada.')
}

export const errorHandler = (
  error: HttpError,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  if (res.headersSent) {
    next(error)
    return
  }
  if (error.type === 'entity.parse.failed') {
    sendApiError(res, 400, 'invalid_request', 'JSON inválido.')
    return
  }
  const log = req.log ?? logger
  log.error({ err: error, requestId: req.id }, 'Unhandled error')
  sendApiError(res, 500, 'internal_error', 'Erro interno. Tente novamente.')
}
