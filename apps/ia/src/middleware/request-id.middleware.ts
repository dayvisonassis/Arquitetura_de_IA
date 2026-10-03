import { randomBytes } from 'crypto'
import type { NextFunction, Request, Response } from 'express'

const TRACE_ID = /^[0-9a-f]{32}$/
const INVALID_TRACE_ID = '0'.repeat(32)

export const isValidRequestId = (value: unknown): value is string =>
  typeof value === 'string' &&
  TRACE_ID.test(value) &&
  value !== INVALID_TRACE_ID

export const requestId = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const incoming = req.get('x-request-id')
  req.id = isValidRequestId(incoming)
    ? incoming
    : randomBytes(16).toString('hex')
  res.setHeader('x-request-id', req.id)
  next()
}
