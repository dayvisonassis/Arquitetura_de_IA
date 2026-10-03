import request from 'supertest'
import app from '../../src/app'

describe('app', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('should answer GET /health/live with status ok', async () => {
    const response = await request(app).get('/health/live')

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ status: 'ok' })
    expect(response.headers['x-powered-by']).toBeUndefined()
  })

  it('responds 404 to an unknown route', async () => {
    const response = await request(app).get('/unknown-route')

    expect(response.status).toBe(404)
  })
})
