jest.mock('../../src/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), error: jest.fn() }
}))

import request from 'supertest'
import app from '../../src/app'
import logger from '../../src/logger'
import { reset } from '../../src/services/simulation-state.service'

const TWO_MB = 2 * 1024 * 1024

// Builds a valid JSON object whose serialized size is exactly `bytes` bytes.
const jsonBodyOfSize = (bytes: number): string => {
  const prefix = '{"content":"'
  const suffix = '"}'
  return `${prefix}${'a'.repeat(bytes - prefix.length - suffix.length)}${suffix}`
}

const postJson = (body: string) =>
  request(app)
    .post('/unknown-route')
    .set('Content-Type', 'application/json')
    .send(body)

describe('app', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    reset()
  })

  it('should answer GET /health/live with status ok', async () => {
    const response = await request(app).get('/health/live')

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ status: 'ok' })
    expect(response.headers['x-powered-by']).toBeUndefined()
  })

  it('should answer an unknown route with 404 in the OpenAI format', async () => {
    const response = await request(app).get('/nope')

    expect(response.status).toBe(404)
    expect(response.headers['content-type']).toMatch(/application\/json/)
    expect(response.headers['x-powered-by']).toBeUndefined()
    expect(response.body).toEqual({
      error: {
        message: 'Unknown route.',
        type: 'invalid_request_error',
        code: 'not_found'
      }
    })
  })

  it('should answer a truncated JSON body with 400 invalid_json', async () => {
    const response = await postJson('{"model":')

    expect(response.status).toBe(400)
    expect(response.body).toEqual({
      error: {
        message: 'The request body is not valid JSON.',
        type: 'invalid_request_error',
        code: 'invalid_json'
      }
    })
    expect(logger.error).not.toHaveBeenCalled()
  })

  it('should answer a JSON primitive body with 400 invalid_json', async () => {
    // The strict parser accepts only objects and arrays at the top level.
    const response = await postJson('123')

    expect(response.status).toBe(400)
    expect(response.body.error.code).toBe('invalid_json')
  })

  it('should answer a body of 2 MB plus one byte with 413 request_too_large', async () => {
    const body = jsonBodyOfSize(TWO_MB + 1)
    expect(Buffer.byteLength(body)).toBe(TWO_MB + 1)

    const response = await postJson(body)

    expect(response.status).toBe(413)
    expect(response.body).toEqual({
      error: {
        message: 'The request body is larger than 2 MB.',
        type: 'invalid_request_error',
        code: 'request_too_large'
      }
    })
    expect(logger.error).not.toHaveBeenCalled()
  })

  it('should parse a body of exactly 2 MB and reach the route handlers', async () => {
    const body = jsonBodyOfSize(TWO_MB)
    expect(Buffer.byteLength(body)).toBe(TWO_MB)

    const response = await postJson(body)

    // No route handles the path, so a parsed body ends in the 404 handler.
    expect(response.status).toBe(404)
    expect(response.body.error.code).toBe('not_found')
  })

  it('should mount the completions and control routes', async () => {
    const completion = await request(app)
      .post('/v1/chat/completions')
      .send({ model: 'm', messages: [{ role: 'user', content: 'Oi' }] })
    const modes = await request(app)
      .post('/control/modes')
      .send({ model: 'm', mode: 'ok' })
    const listed = await request(app).get('/control/modes')
    const stats = await request(app).get('/control/stats')
    const cleared = await request(app).post('/control/reset')

    expect(completion.status).toBe(200)
    expect(completion.body.object).toBe('chat.completion')
    expect(completion.headers['x-powered-by']).toBeUndefined()
    expect(modes.status).toBe(200)
    expect(listed.status).toBe(200)
    expect(listed.body.modes.m.mode).toBe('ok')
    expect(stats.status).toBe(200)
    expect(stats.body.models.m.calls).toBe(1)
    expect(cleared.status).toBe(204)
  })

  it.each<['get' | 'post' | 'delete', string]>([
    ['get', '/v1/chat/completions'],
    ['post', '/v1/completions'],
    ['post', '/chat/completions'],
    ['delete', '/control/modes'],
    ['get', '/control/reset'],
    ['post', '/control/stats']
  ])(
    'should answer %s %s with 404, since only the spec routes exist',
    async (method, path) => {
      const response = await request(app)[method](path)

      expect(response.status).toBe(404)
      expect(response.body.error.code).toBe('not_found')
    }
  )

  it('should answer invalid JSON, a large body and an unknown route in the OpenAI format', async () => {
    const responses = await Promise.all([
      postJson('{"model":'),
      postJson(jsonBodyOfSize(TWO_MB + 1)),
      request(app).get('/nope')
    ])

    expect(responses.map(response => response.status)).toEqual([400, 413, 404])
    expect(responses.map(response => response.body.error.code)).toEqual([
      'invalid_json',
      'request_too_large',
      'not_found'
    ])
    responses.forEach(response => {
      expect(Object.keys(response.body.error).sort()).toEqual([
        'code',
        'message',
        'type'
      ])
    })
  })
})
