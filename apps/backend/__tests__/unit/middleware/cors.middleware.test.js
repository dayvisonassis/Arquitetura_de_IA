jest.mock('../../../src/config/env', () => ({
  config: { frontendOrigin: 'http://127.0.0.1:4200' }
}))

import express from 'express'
import request from 'supertest'
import { corsMiddleware } from '../../../src/middleware/cors.middleware'

const FRONTEND = 'http://127.0.0.1:4200'

describe('cors.middleware', () => {
  let app
  let route

  beforeEach(() => {
    jest.clearAllMocks()
    route = jest.fn((_req, res) => res.status(200).json({ ok: true }))
    app = express()
    app.use(corsMiddleware)
    app.all('/resource', route)
  })

  it('should allow the configured frontend origin', async () => {
    const preflight = await request(app)
      .options('/resource')
      .set('Origin', FRONTEND)
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'authorization')
    const get = await request(app).get('/resource').set('Origin', FRONTEND)

    expect(preflight.status).toBe(204)
    expect(preflight.headers['access-control-allow-origin']).toBe(FRONTEND)
    expect(preflight.headers['access-control-allow-methods']).toBe(
      'GET,POST,PUT,PATCH,DELETE'
    )
    expect(preflight.headers['access-control-allow-headers']).toBe(
      'Authorization,Content-Type,x-request-id'
    )
    expect(get.status).toBe(200)
    expect(get.headers['access-control-allow-origin']).toBe(FRONTEND)
    expect(get.headers['access-control-expose-headers']).toBe('x-request-id')
  })

  it('should refuse another origin with 403', async () => {
    const response = await request(app)
      .get('/resource')
      .set('Origin', 'http://evil.example')

    expect(response.status).toBe(403)
    expect(response.body).toEqual({ message: 'Origem não permitida.' })
    expect(response.headers['access-control-allow-origin']).toBeUndefined()
    expect(route).not.toHaveBeenCalled()
  })

  it('should let requests without Origin through', async () => {
    const response = await request(app).get('/resource')

    expect(response.status).toBe(200)
    expect(response.headers['access-control-allow-origin']).toBeUndefined()
    expect(route).toHaveBeenCalledTimes(1)
  })
})
