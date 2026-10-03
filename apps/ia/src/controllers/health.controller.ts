import type { Request, Response } from 'express'
import { checkReadiness } from '../services/health.service'

export const live = (_req: Request, res: Response): void => {
  res.status(200).json({ status: 'ok' })
}

export const ready = async (req: Request, res: Response): Promise<void> => {
  const { ok, checks } = await checkReadiness()
  if (ok) {
    res.status(200).json({ status: 'ok', checks })
    return
  }
  req.log?.warn({ checks }, 'Readiness check failed')
  res.status(503).json({ status: 'unavailable', checks })
}
