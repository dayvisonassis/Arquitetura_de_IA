import request from 'supertest'
import app from '../../src/app'

describe('app', () => {
  it('responds 404 to an unknown route', async () => {
    const response = await request(app).get('/unknown-route')

    expect(response.status).toBe(404)
  })
})
