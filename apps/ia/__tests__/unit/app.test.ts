jest.mock('../../src/config/env', () => ({
  config: {
    nodeEnv: 'testing',
    logLevel: 'info',
    masterKey: 'k'.repeat(40),
    db: { database: 'gateway_test' },
    redis: {}
  }
}))

import request from 'supertest'
import app from '../../src/app'

const MASTER_KEY = 'k'.repeat(40)
const TRACE_ID = /^[0-9a-f]{32}$/
const VALID_ID = '4bf92f3577b34da6a3ce929d0e0e4736'

const UNAUTHORIZED = {
  error: {
    message: 'Chave administrativa ausente ou inválida.',
    type: 'authentication_error',
    code: 'invalid_admin_key'
  }
}

const NOT_FOUND = {
  error: {
    message: 'Rota não encontrada.',
    type: 'invalid_request_error',
    code: 'not_found'
  }
}

describe('app', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('responds 404 to an unknown route', async () => {
    const response = await request(app).get('/unknown-route')

    expect(response.status).toBe(404)
    expect(response.body).toEqual(NOT_FOUND)
    expect(response.headers['x-request-id']).toMatch(TRACE_ID)
  })

  it('should echo a valid x-request-id and drop x-powered-by', async () => {
    const response = await request(app)
      .get('/health/live')
      .set('x-request-id', VALID_ID)

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ status: 'ok' })
    expect(response.headers['x-request-id']).toBe(VALID_ID)
    expect(response.headers['x-powered-by']).toBeUndefined()
  })

  it('should answer 401 without the master key', async () => {
    const response = await request(app)
      .get('/admin/domains')
      .set('x-request-id', VALID_ID)

    expect(response.status).toBe(401)
    expect(response.body).toEqual(UNAUTHORIZED)
    expect(response.headers['x-request-id']).toBe(VALID_ID)
  })

  it('should require the master key on the catalog routes', async () => {
    const listed = await request(app).get('/admin/catalog')
    const suspended = await request(app)
      .post('/admin/capabilities/ticket-classifier/suspend')
      .send({ reason: 'x', actor: 'admin@aigateway.test' })

    expect(listed.status).toBe(401)
    expect(listed.body).toEqual(UNAUTHORIZED)
    expect(suspended.status).toBe(401)
  })

  it('should answer 401 with a wrong master key', async () => {
    const response = await request(app)
      .get('/admin/domains')
      .set('Authorization', `Bearer ${'w'.repeat(40)}`)

    expect(response.status).toBe(401)
    expect(response.body).toEqual(UNAUTHORIZED)
  })

  it('should answer 404 not_found with the right key', async () => {
    const response = await request(app)
      .get('/admin/domains')
      .set('Authorization', `Bearer ${MASTER_KEY}`)

    expect(response.status).toBe(404)
    expect(response.body).toEqual(NOT_FOUND)
  })

  it('should answer 400 invalid_request for invalid JSON', async () => {
    const response = await request(app)
      .post('/admin/domains')
      .set('Authorization', `Bearer ${MASTER_KEY}`)
      .set('content-type', 'application/json')
      .send('{bad')

    expect(response.status).toBe(400)
    expect(response.body.error.code).toBe('invalid_request')
    expect(response.headers['x-request-id']).toMatch(TRACE_ID)
  })
})
