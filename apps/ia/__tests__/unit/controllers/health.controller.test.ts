jest.mock('../../../src/services/health.service', () => ({
  checkReadiness: jest.fn()
}))

import type { Request, Response } from 'express'
import { live, ready } from '../../../src/controllers/health.controller'
import { checkReadiness } from '../../../src/services/health.service'

describe('health.controller', () => {
  let res: Response
  let status: jest.Mock
  let json: jest.Mock

  beforeEach(() => {
    jest.clearAllMocks()
    json = jest.fn()
    status = jest.fn().mockReturnValue({ json })
    res = { status } as unknown as Response
  })

  it('live should answer 200 with status ok', () => {
    live({} as Request, res)

    expect(status).toHaveBeenCalledWith(200)
    expect(json).toHaveBeenCalledWith({ status: 'ok' })
  })

  it('ready should answer 200 with the checks when everything is up', async () => {
    const checks = { mysql: 'ok' as const, redis: 'ok' as const }
    jest.mocked(checkReadiness).mockResolvedValue({ ok: true, checks })

    await ready({} as Request, res)

    expect(status).toHaveBeenCalledWith(200)
    expect(json).toHaveBeenCalledWith({ status: 'ok', checks })
  })

  it('ready should answer 503 in the health format, without message, and log it', async () => {
    const checks = { mysql: 'ok' as const, redis: 'fail' as const }
    const warn = jest.fn()
    jest.mocked(checkReadiness).mockResolvedValue({ ok: false, checks })

    await ready({ log: { warn } } as unknown as Request, res)

    expect(status).toHaveBeenCalledWith(503)
    expect(json).toHaveBeenCalledWith({ status: 'unavailable', checks })
    expect(warn).toHaveBeenCalledWith({ checks }, 'Readiness check failed')
  })

  it('ready should answer 503 without a request logger', async () => {
    const checks = { mysql: 'fail' as const, redis: 'ok' as const }
    jest.mocked(checkReadiness).mockResolvedValue({ ok: false, checks })

    await ready({} as Request, res)

    expect(status).toHaveBeenCalledWith(503)
  })
})
