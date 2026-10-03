const request = require('supertest')
const app = require('../../src/app')
const {
  setupTestDatabase,
  cleanupTestDatabase
} = require('../utils/test-setup')

const TRACE_ID = /^[0-9a-f]{32}$/

describe('Health API', () => {
  beforeAll(async () => {
    await setupTestDatabase()
  })

  afterAll(async () => {
    await cleanupTestDatabase()
  })

  describe('GET /health/live', () => {
    it('should answer 200 with status ok and a request id', async () => {
      const response = await request(app).get('/health/live')

      expect(response.status).toBe(200)
      expect(response.body).toEqual({ status: 'ok' })
      expect(response.headers['x-request-id']).toMatch(TRACE_ID)
    })
  })

  describe('GET /health/ready', () => {
    it('should report ok with MySQL and Redis up', async () => {
      const response = await request(app).get('/health/ready')

      expect(response.status).toBe(200)
      expect(response.body).toEqual({
        status: 'ok',
        checks: { mysql: 'ok', redis: 'ok' }
      })
      expect(response.headers['x-request-id']).toMatch(TRACE_ID)
    })

    it('should stay ok on repeated calls, reusing the connections', async () => {
      const first = await request(app).get('/health/ready')
      const second = await request(app).get('/health/ready')

      expect(first.status).toBe(200)
      expect(second.status).toBe(200)
      expect(second.body.checks).toEqual({ mysql: 'ok', redis: 'ok' })
    })

    it('should answer without authentication and outside /v2', async () => {
      const response = await request(app)
        .get('/health/ready')
        .set('Authorization', 'Bearer not-a-token')

      expect(response.status).toBe(200)
      expect(response.body).toHaveProperty('checks')
    })
  })
})
