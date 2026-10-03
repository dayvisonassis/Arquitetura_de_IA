import request from 'supertest'
import app from '../../src/app'
import { cleanupTestDatabase, setupTestDatabase } from '../utils/test-setup'

const TRACE_ID = /^[0-9a-f]{32}$/

describe('Health API', () => {
  beforeAll(async () => {
    await setupTestDatabase()
  })

  afterAll(async () => {
    await cleanupTestDatabase()
  })

  it('GET /health/live should answer 200 with status ok and a request id', async () => {
    const response = await request(app).get('/health/live')

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ status: 'ok' })
    expect(response.headers['x-request-id']).toMatch(TRACE_ID)
  })

  it('should report ok with MySQL and Redis up', async () => {
    const response = await request(app).get('/health/ready')

    expect(response.status).toBe(200)
    expect(response.body).toEqual({
      status: 'ok',
      checks: { mysql: 'ok', redis: 'ok' }
    })
  })

  it('should answer /health/ready without the master key', async () => {
    const first = await request(app).get('/health/ready')
    const second = await request(app).get('/health/ready')

    expect(first.status).toBe(200)
    expect(second.body.checks).toEqual({ mysql: 'ok', redis: 'ok' })
  })
})
