import request from 'supertest'
import app from '../../src/app'

const TRACE_ID = /^[0-9a-f]{32}$/
const VALID_ID = '4bf92f3577b34da6a3ce929d0e0e4736'

describe('app', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('responds 404 to an unknown route', async () => {
    const response = await request(app).get('/unknown-route')

    expect(response.status).toBe(404)
    expect(response.body).toEqual({ message: 'Rota não encontrada.' })
    expect(response.headers['x-request-id']).toMatch(TRACE_ID)
  })

  it('should mount an empty /v2 router that falls through to 404', async () => {
    const response = await request(app).get('/v2/anything')

    expect(response.status).toBe(404)
    expect(response.body).toEqual({ message: 'Rota não encontrada.' })
  })

  it('should set x-request-id on 404, 400 and 403 responses', async () => {
    const notFound = await request(app)
      .get('/v2/missing')
      .set('x-request-id', VALID_ID)
    const badJson = await request(app)
      .post('/v2/anything')
      .set('content-type', 'application/json')
      .send('{bad')
    const forbidden = await request(app)
      .get('/health/live')
      .set('Origin', 'http://evil.example')

    expect(notFound.headers['x-request-id']).toBe(VALID_ID)
    expect(badJson.status).toBe(400)
    expect(badJson.body).toEqual({ message: 'JSON inválido.' })
    expect(badJson.headers['x-request-id']).toMatch(TRACE_ID)
    expect(forbidden.status).toBe(403)
    expect(forbidden.headers['x-request-id']).toMatch(TRACE_ID)
  })

  it('should answer GET /health/live without x-powered-by', async () => {
    const response = await request(app).get('/health/live')

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ status: 'ok' })
    expect(response.headers['x-powered-by']).toBeUndefined()
  })
})
