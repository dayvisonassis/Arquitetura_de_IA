import type { Request, Response } from 'express'

export const live = (_req: Request, res: Response): void => {
  res.status(200).json({ status: 'ok' })
}
