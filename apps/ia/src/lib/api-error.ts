import type { Response } from 'express'

const TYPES: Record<number, string> = {
  400: 'invalid_request_error',
  401: 'authentication_error',
  404: 'invalid_request_error',
  500: 'server_error'
}

type ApiError = {
  error: { message: string; type: string; code: string }
}

export const errorType = (status: number): string =>
  TYPES[status] ?? (status >= 500 ? 'server_error' : 'invalid_request_error')

export const apiError = (
  status: number,
  code: string,
  message: string
): ApiError => ({ error: { message, type: errorType(status), code } })

export const sendApiError = (
  res: Response,
  status: number,
  code: string,
  message: string
): void => {
  res.status(status).json(apiError(status, code, message))
}
