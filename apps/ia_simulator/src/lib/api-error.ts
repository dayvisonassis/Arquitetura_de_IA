import type { Response } from 'express'

const errorType = (status: number): string =>
  status >= 500 ? 'server_error' : 'invalid_request_error'

export const sendApiError = (
  res: Response,
  status: number,
  code: string,
  message: string,
  type: string = errorType(status)
): void => {
  res.status(status).json({ error: { message, type, code } })
}
