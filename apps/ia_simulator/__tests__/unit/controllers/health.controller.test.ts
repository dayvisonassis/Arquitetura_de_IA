import type { Request, Response } from 'express'
import { live } from '../../../src/controllers/health.controller'

describe('health.controller', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('live should answer 200 with status ok', () => {
    const json = jest.fn()
    const status = jest.fn().mockReturnValue({ json })

    live({} as Request, { status } as unknown as Response)

    expect(status).toHaveBeenCalledWith(200)
    expect(json).toHaveBeenCalledWith({ status: 'ok' })
  })
})
