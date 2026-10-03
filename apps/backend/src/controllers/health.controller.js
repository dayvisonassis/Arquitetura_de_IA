import { checkReadiness } from '../services/health.service'

export const live = (_req, res) => {
  res.status(200).json({ status: 'ok' })
}

export const ready = async (req, res) => {
  const { ok, checks } = await checkReadiness()
  if (ok) {
    res.status(200).json({ status: 'ok', checks })
    return
  }
  req.log?.warn({ checks }, 'Readiness check failed')
  res
    .status(503)
    .json({ message: 'Serviço indisponível.', status: 'unavailable', checks })
}
