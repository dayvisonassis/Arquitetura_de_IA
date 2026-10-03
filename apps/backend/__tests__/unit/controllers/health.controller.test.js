jest.mock('../../../src/services/health.service', () => ({
  checkReadiness: jest.fn()
}))

import { live, ready } from '../../../src/controllers/health.controller'
import { checkReadiness } from '../../../src/services/health.service'

describe('health.controller', () => {
  let res

  beforeEach(() => {
    jest.clearAllMocks()
    res = { status: jest.fn().mockReturnThis(), json: jest.fn() }
  })

  it('live should answer 200 with status ok', () => {
    live({}, res)

    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.json).toHaveBeenCalledWith({ status: 'ok' })
  })

  it('ready should answer 200 with the checks when everything is up', async () => {
    const checks = { mysql: 'ok', redis: 'ok' }
    checkReadiness.mockResolvedValue({ ok: true, checks })

    await ready({}, res)

    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.json).toHaveBeenCalledWith({ status: 'ok', checks })
  })

  it('ready should answer 503 with the failed checks and log them', async () => {
    const checks = { mysql: 'fail', redis: 'ok' }
    const req = { log: { warn: jest.fn() } }
    checkReadiness.mockResolvedValue({ ok: false, checks })

    await ready(req, res)

    expect(res.status).toHaveBeenCalledWith(503)
    expect(res.json).toHaveBeenCalledWith({
      message: 'Serviço indisponível.',
      status: 'unavailable',
      checks
    })
    expect(req.log.warn).toHaveBeenCalledWith(
      { checks },
      'Readiness check failed'
    )
  })

  it('ready should answer 503 without a request logger', async () => {
    const checks = { mysql: 'ok', redis: 'fail' }
    checkReadiness.mockResolvedValue({ ok: false, checks })

    await ready({}, res)

    expect(res.status).toHaveBeenCalledWith(503)
  })
})
