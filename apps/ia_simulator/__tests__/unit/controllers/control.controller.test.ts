jest.mock('../../../src/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), error: jest.fn() }
}))

import request from 'supertest'
import app from '../../../src/app'
import logger from '../../../src/logger'
import { reset } from '../../../src/services/simulation-state.service'

const MODEL = 'gpt-4.1-mini'

const RULES = {
  model: "The field 'model' must be a string from 1 to 200 characters.",
  times: "The field 'times' must be an integer from 1 to 1000.",
  content: "The field 'content' must be a string from 1 to 20000 characters.",
  status:
    "The field 'status' must be one of 400, 401, 403, 404, 429, 500, 502, 503.",
  retryAfter:
    "The field 'retry_after_seconds' must be an integer from 0 to 120.",
  delay: "The field 'delay_ms' must be an integer from 0 to 120000."
}

const SPEC_MODE = {
  model: MODEL,
  mode: 'error',
  status: 503,
  retry_after_seconds: 2,
  times: 3
}

const postMode = (body: object) =>
  request(app).post('/control/modes').send(body)

const getModes = () => request(app).get('/control/modes')

const getStats = () => request(app).get('/control/stats')

const complete = (model: string = MODEL) =>
  request(app)
    .post('/v1/chat/completions')
    .send({ model, messages: [{ role: 'user', content: 'Oi' }] })

const invalidValue = (message: string) => ({
  error: { message, type: 'invalid_request_error', code: 'invalid_value' }
})

// Each row is a single violation of the spec §5 table.
const INVALID_BODIES: Array<[string, object, string]> = [
  [
    'a JSON array body',
    [{ model: MODEL, mode: 'ok' }],
    'The request body must be a JSON object.'
  ],
  ['a missing mode', { model: MODEL }, "The field 'mode' is required."],
  [
    'an unknown mode',
    { model: MODEL, mode: 'crash' },
    "The field 'mode' must be one of ok, error, slow, timeout, fenced-json, invalid-json."
  ],
  [
    'a mode in upper case',
    { model: MODEL, mode: 'OK' },
    "The field 'mode' must be one of ok, error, slow, timeout, fenced-json, invalid-json."
  ],
  [
    'a null mode',
    { model: MODEL, mode: null },
    "The field 'mode' must be one of ok, error, slow, timeout, fenced-json, invalid-json."
  ],
  ['a missing model', { mode: 'ok' }, "The field 'model' is required."],
  ['an empty model', { model: '', mode: 'ok' }, RULES.model],
  [
    'a model of 201 characters',
    { model: 'm'.repeat(201), mode: 'ok' },
    RULES.model
  ],
  ['a numeric model', { model: 5, mode: 'ok' }, RULES.model],
  ['times 0', { model: MODEL, mode: 'ok', times: 0 }, RULES.times],
  ['times 1001', { model: MODEL, mode: 'ok', times: 1001 }, RULES.times],
  ['a decimal times', { model: MODEL, mode: 'ok', times: 1.5 }, RULES.times],
  ['times as a string', { model: MODEL, mode: 'ok', times: '2' }, RULES.times],
  ['a null times', { model: MODEL, mode: 'ok', times: null }, RULES.times],
  [
    'an empty content',
    { model: MODEL, mode: 'ok', content: '' },
    RULES.content
  ],
  [
    'a content of 20001 characters',
    { model: MODEL, mode: 'ok', content: 'a'.repeat(20001) },
    RULES.content
  ],
  [
    'a numeric content',
    { model: MODEL, mode: 'slow', delay_ms: 1, content: 5 },
    RULES.content
  ],
  [
    'error without status',
    { model: MODEL, mode: 'error' },
    "The field 'status' is required."
  ],
  ['status 418', { model: MODEL, mode: 'error', status: 418 }, RULES.status],
  [
    'status as a string',
    { model: MODEL, mode: 'error', status: '503' },
    RULES.status
  ],
  [
    'retry_after_seconds -1',
    { model: MODEL, mode: 'error', status: 503, retry_after_seconds: -1 },
    RULES.retryAfter
  ],
  [
    'retry_after_seconds 121',
    { model: MODEL, mode: 'error', status: 429, retry_after_seconds: 121 },
    RULES.retryAfter
  ],
  [
    'a decimal retry_after_seconds',
    { model: MODEL, mode: 'error', status: 429, retry_after_seconds: 1.5 },
    RULES.retryAfter
  ],
  [
    'retry_after_seconds with status 500',
    { model: MODEL, mode: 'error', status: 500, retry_after_seconds: 2 },
    "The field 'retry_after_seconds' is only accepted with status 429 or 503."
  ],
  [
    'retry_after_seconds with status 401',
    { model: MODEL, mode: 'error', status: 401, retry_after_seconds: 2 },
    "The field 'retry_after_seconds' is only accepted with status 429 or 503."
  ],
  [
    'retry_after_seconds with status 502',
    { model: MODEL, mode: 'error', status: 502, retry_after_seconds: 0 },
    "The field 'retry_after_seconds' is only accepted with status 429 or 503."
  ],
  [
    'retry_after_seconds with status 400',
    { model: MODEL, mode: 'error', status: 400, retry_after_seconds: 2 },
    "The field 'retry_after_seconds' is only accepted with status 429 or 503."
  ],
  [
    'retry_after_seconds with status 403',
    { model: MODEL, mode: 'error', status: 403, retry_after_seconds: 0 },
    "The field 'retry_after_seconds' is only accepted with status 429 or 503."
  ],
  [
    'retry_after_seconds with status 404',
    { model: MODEL, mode: 'error', status: 404, retry_after_seconds: 120 },
    "The field 'retry_after_seconds' is only accepted with status 429 or 503."
  ],
  [
    'slow without delay_ms',
    { model: MODEL, mode: 'slow' },
    "The field 'delay_ms' is required."
  ],
  [
    'delay_ms 120001',
    { model: MODEL, mode: 'slow', delay_ms: 120001 },
    RULES.delay
  ],
  ['delay_ms -1', { model: MODEL, mode: 'slow', delay_ms: -1 }, RULES.delay],
  [
    'a decimal delay_ms',
    { model: MODEL, mode: 'slow', delay_ms: 1.5 },
    RULES.delay
  ],
  [
    'content that is not JSON in fenced-json',
    { model: MODEL, mode: 'fenced-json', content: 'not json' },
    "The field 'content' must be valid JSON in fenced-json mode."
  ],
  [
    'a JSON object as content in invalid-json',
    { model: MODEL, mode: 'invalid-json', content: '{"a": 1}' },
    "The field 'content' must not be valid JSON in invalid-json mode."
  ],
  [
    'a JSON number as content in invalid-json',
    { model: MODEL, mode: 'invalid-json', content: '42' },
    "The field 'content' must not be valid JSON in invalid-json mode."
  ],
  [
    'an unknown field',
    { model: MODEL, mode: 'timeout', foo: 1 },
    "The field 'foo' is not accepted in timeout mode."
  ],
  [
    'content in error mode',
    { model: MODEL, mode: 'error', status: 503, content: 'x' },
    "The field 'content' is not accepted in error mode."
  ],
  [
    'content in timeout mode',
    { model: MODEL, mode: 'timeout', content: 'x' },
    "The field 'content' is not accepted in timeout mode."
  ],
  [
    'status in ok mode',
    { model: MODEL, mode: 'ok', status: 503 },
    "The field 'status' is not accepted in ok mode."
  ],
  [
    'delay_ms in fenced-json mode',
    { model: MODEL, mode: 'fenced-json', delay_ms: 10 },
    "The field 'delay_ms' is not accepted in fenced-json mode."
  ],
  [
    'retry_after_seconds in slow mode',
    { model: MODEL, mode: 'slow', delay_ms: 10, retry_after_seconds: 1 },
    "The field 'retry_after_seconds' is not accepted in slow mode."
  ],
  [
    'delay_ms in invalid-json mode',
    { model: MODEL, mode: 'invalid-json', delay_ms: 10 },
    "The field 'delay_ms' is not accepted in invalid-json mode."
  ]
]

// Boundary values of the spec §5 table that must be accepted.
const VALID_BODIES: Array<[string, Record<string, unknown>]> = [
  ['a model of 200 characters', { model: 'm'.repeat(200), mode: 'ok' }],
  ['times 1', { model: MODEL, mode: 'ok', times: 1 }],
  ['times 1000', { model: MODEL, mode: 'timeout', times: 1000 }],
  [
    'a content of 20000 characters',
    { model: MODEL, mode: 'ok', content: 'a'.repeat(20000) }
  ],
  ['status 401', { model: MODEL, mode: 'error', status: 401 }],
  ['status 500', { model: MODEL, mode: 'error', status: 500 }],
  ['status 502', { model: MODEL, mode: 'error', status: 502 }],
  [
    'retry_after_seconds 0 with status 429',
    { model: MODEL, mode: 'error', status: 429, retry_after_seconds: 0 }
  ],
  [
    'retry_after_seconds 120 with status 503',
    { model: MODEL, mode: 'error', status: 503, retry_after_seconds: 120 }
  ],
  ['delay_ms 0', { model: MODEL, mode: 'slow', delay_ms: 0 }],
  [
    'delay_ms 120000 with content',
    { model: MODEL, mode: 'slow', delay_ms: 120000, content: 'Late.' }
  ],
  ['timeout without fields', { model: MODEL, mode: 'timeout' }],
  [
    'a JSON list in fenced-json',
    { model: MODEL, mode: 'fenced-json', content: '[1, 2]' }
  ],
  [
    'plain text in invalid-json',
    { model: MODEL, mode: 'invalid-json', content: 'category: billing' }
  ]
]

describe('control.controller', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    reset()
  })

  describe('POST /control/modes', () => {
    it('should validate each mode', async () => {
      const kept = await postMode({
        model: MODEL,
        mode: 'ok',
        content: 'Kept.'
      })
      expect(kept.status).toBe(200)
      jest.mocked(logger.info).mockClear()

      for (const [, body, message] of INVALID_BODIES) {
        const response = await postMode(body)

        expect(response.status).toBe(400)
        expect(response.body).toEqual(invalidValue(message))
      }

      const modes = await getModes()
      expect(modes.body).toEqual({
        modes: {
          [MODEL]: { mode: 'ok', content: 'Kept.', remaining_calls: null }
        }
      })
      expect(logger.info).not.toHaveBeenCalled()
    })

    it.each(INVALID_BODIES)(
      'should reject %s with 400 invalid_value and store nothing',
      async (_label, body, message) => {
        const response = await postMode(body)

        expect(response.status).toBe(400)
        expect(response.body).toEqual(invalidValue(message))
        expect((await getModes()).body).toEqual({ modes: {} })
      }
    )

    it.each(VALID_BODIES)('should accept %s', async (_label, body) => {
      const response = await postMode(body)

      expect(response.status).toBe(200)
      expect(response.body).toMatchObject({
        model: body.model,
        mode: body.mode,
        remaining_calls: body.times ?? null
      })
    })

    it.each([400, 403, 404])(
      'should accept the definitive error status %i and store it',
      async status => {
        const response = await postMode({ model: MODEL, mode: 'error', status })

        expect(response.status).toBe(200)
        expect(response.body).toEqual({
          model: MODEL,
          mode: 'error',
          status,
          remaining_calls: null
        })
        expect((await getModes()).body).toEqual({
          modes: { [MODEL]: { mode: 'error', status, remaining_calls: null } }
        })
        // The completions endpoint answers the stored status, so the accepted
        // list and the error table of the simulator stay in step.
        expect((await complete()).status).toBe(status)
      }
    )

    it('should answer a body that is not JSON with 400 invalid_json', async () => {
      const responses = await Promise.all([
        request(app)
          .post('/control/modes')
          .set('Content-Type', 'application/json')
          .send('{"model":'),
        request(app)
          .post('/control/modes')
          .set('Content-Type', 'application/json')
          .send('123')
      ])

      responses.forEach(response => {
        expect(response.status).toBe(400)
        expect(response.body.error.code).toBe('invalid_json')
      })
      expect((await getModes()).body).toEqual({ modes: {} })
    })

    it('should ask for the mode when the body is not sent as JSON', async () => {
      const response = await request(app)
        .post('/control/modes')
        .set('Content-Type', 'text/plain')
        .send('mode=ok')

      expect(response.status).toBe(400)
      expect(response.body).toEqual(
        invalidValue("The field 'mode' is required.")
      )
    })

    it('should store and list a mode', async () => {
      const stored = await postMode(SPEC_MODE)

      expect(stored.status).toBe(200)
      expect(stored.body).toEqual({
        model: MODEL,
        mode: 'error',
        status: 503,
        retry_after_seconds: 2,
        remaining_calls: 3
      })
      expect(logger.info).toHaveBeenCalledWith(
        { model: MODEL, mode: 'error' },
        'Simulation mode set'
      )

      const listed = await getModes()
      expect(listed.status).toBe(200)
      expect(listed.body).toEqual({
        modes: {
          [MODEL]: {
            mode: 'error',
            status: 503,
            retry_after_seconds: 2,
            remaining_calls: 3
          }
        }
      })

      await complete()
      await complete()

      expect((await getModes()).body).toEqual({
        modes: {
          [MODEL]: {
            mode: 'error',
            status: 503,
            retry_after_seconds: 2,
            remaining_calls: 1
          }
        }
      })
    })

    it('should store a mode without times with remaining_calls null', async () => {
      const response = await postMode({
        model: MODEL,
        mode: 'slow',
        delay_ms: 15000
      })

      expect(response.body).toEqual({
        model: MODEL,
        mode: 'slow',
        delay_ms: 15000,
        remaining_calls: null
      })
    })

    it('should list an ok mode configured explicitly and every model apart', async () => {
      await postMode({ model: MODEL, mode: 'ok' })
      await postMode({ model: 'other', mode: 'timeout', times: 2 })

      expect((await getModes()).body).toEqual({
        modes: {
          [MODEL]: { mode: 'ok', remaining_calls: null },
          other: { mode: 'timeout', remaining_calls: 2 }
        }
      })
    })

    it('should replace the previous mode and keep the stats', async () => {
      await postMode({ model: MODEL, mode: 'error', status: 500 })
      await complete()

      const replaced = await postMode({ model: MODEL, mode: 'ok', times: 2 })

      expect(replaced.body).toEqual({
        model: MODEL,
        mode: 'ok',
        remaining_calls: 2
      })
      expect((await getModes()).body).toEqual({
        modes: { [MODEL]: { mode: 'ok', remaining_calls: 2 } }
      })
      const stats = await getStats()
      expect(stats.body.models[MODEL].calls).toBe(1)
      expect(stats.body.models[MODEL].requests[0].mode).toBe('error')
    })

    it('should return the model to the default when times runs out', async () => {
      await postMode({ model: MODEL, mode: 'error', status: 429, times: 1 })

      const first = await complete()

      expect(first.status).toBe(429)
      expect((await getModes()).body).toEqual({ modes: {} })
      const second = await complete()
      expect(second.status).toBe(200)
      expect(second.body.choices[0].message.content).toBe('Resposta simulada.')
    })
  })

  describe('GET /control/stats', () => {
    it('should answer an empty list before any call', async () => {
      const response = await getStats()

      expect(response.status).toBe(200)
      expect(response.body).toEqual({ models: {} })
    })

    it('should answer the calls and the requests of each model', async () => {
      await postMode({ model: MODEL, mode: 'error', status: 503 })
      await complete()
      await complete('other')

      const response = await getStats()

      expect(response.status).toBe(200)
      expect(response.body).toEqual({
        models: {
          [MODEL]: {
            calls: 1,
            requests: [
              {
                received_at: expect.any(String),
                mode: 'error',
                body: {
                  model: MODEL,
                  messages: [{ role: 'user', content: 'Oi' }]
                }
              }
            ]
          },
          other: {
            calls: 1,
            requests: [
              {
                received_at: expect.any(String),
                mode: 'ok',
                body: {
                  model: 'other',
                  messages: [{ role: 'user', content: 'Oi' }]
                }
              }
            ]
          }
        }
      })
    })
  })

  describe('POST /control/reset', () => {
    it('should reset with 204', async () => {
      await postMode(SPEC_MODE)
      await postMode({ model: 'other', mode: 'ok' })
      await complete()
      await complete('other')

      const response = await request(app).post('/control/reset')

      expect(response.status).toBe(204)
      expect(response.text).toBe('')
      expect(logger.info).toHaveBeenCalledWith('Simulation reset')
      expect((await getModes()).body).toEqual({ modes: {} })
      expect((await getStats()).body).toEqual({ models: {} })
    })

    it('should reset an empty state and ignore the body', async () => {
      const response = await request(app)
        .post('/control/reset')
        .send({ anything: true })

      expect(response.status).toBe(204)
      expect((await getModes()).body).toEqual({ modes: {} })
    })
  })
})
