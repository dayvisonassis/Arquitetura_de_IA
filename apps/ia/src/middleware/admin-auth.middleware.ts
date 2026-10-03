import { createHash, timingSafeEqual } from 'crypto'
import type { NextFunction, Request, Response } from 'express'
import { config } from '../config/env'
import { sendApiError } from '../lib/api-error'

const BEARER = /^Bearer (\S+)$/

const digest = (value: string): Buffer =>
  createHash('sha256').update(value).digest()

const hasMasterKey = (req: Request): boolean => {
  const match = BEARER.exec(req.get('authorization') ?? '')
  if (!match || !config.masterKey) {
    return false
  }
  return timingSafeEqual(digest(match[1]), digest(config.masterKey))
}

export const adminAuth = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  if (!hasMasterKey(req)) {
    sendApiError(
      res,
      401,
      'invalid_admin_key',
      'Chave administrativa ausente ou inválida.'
    )
    return
  }
  next()
}
