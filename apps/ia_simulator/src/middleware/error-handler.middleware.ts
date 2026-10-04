import type { NextFunction, Request, Response } from 'express'
import logger from '../logger'
import { sendApiError } from '../lib/api-error'

type HttpError = Error & { type?: string }

export const notFound = (_req: Request, res: Response): void => {
  sendApiError(res, 404, 'not_found', 'Unknown route.')
}

export const errorHandler = (
  error: HttpError,
  _req: Request,
  res: Response,
  next: NextFunction
): void => {
  if (res.headersSent) {
    next(error)
    return
  }
  if (error.type === 'entity.parse.failed') {
    sendApiError(
      res,
      400,
      'invalid_json',
      'The request body is not valid JSON.'
    )
    return
  }
  if (error.type === 'entity.too.large') {
    sendApiError(
      res,
      413,
      'request_too_large',
      'The request body is larger than 2 MB.'
    )
    return
  }
  logger.error({ err: error }, 'Unhandled error')
  sendApiError(res, 500, 'internal_error', 'Internal error.')
}
