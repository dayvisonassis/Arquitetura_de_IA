jest.mock('../../../src/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), error: jest.fn() }
}))
jest.mock('../../../src/lib/wait', () => ({ wait: jest.fn() }))

import type { Server } from 'http'
import type { AddressInfo } from 'net'
import request from 'supertest'
import app from '../../../src/app'
import { wait } from '../../../src/lib/wait'
import logger from '../../../src/logger'
import * as completionService from '../../../src/services/completion.service'
import * as state from '../../../src/services/simulation-state.service'

const PATH = '/v1/chat/completions'
const MODEL = 'gpt-4.1-mini'
const FENCE = '```'
const DEFAULT_CONTENT = 'Resposta simulada.'
const DEFAULT_INVALID_JSON =
  'Categoria: billing. Motivo: cobrança duplicada na assinatura.'

// The request of spec §5: 40 characters of input (10 tokens).
const SPEC_REQUEST = {
  model: MODEL,
  messages: [
    { role: 'system', content: 'Responda em JSON.' },
    { role: 'user', content: 'Fui cobrado duas vezes.' }
  ],
  max_completion_tokens: 256,
  response_format: { type: 'json_object' }
}

// The error table of spec §5, one row per status the error mode accepts.
const OPENAI_ERRORS = [
  {
    status: 400,
    type: 'invalid_request_error',
    code: 'unsupported_parameter',
    message:
      'Unsupported parameter: this parameter is not supported with this model.'
  },
  {
    status: 401,
    type: 'invalid_request_error',
    code: 'invalid_api_key',
    message: 'Incorrect API key provided.'
  },
  {
    status: 403,
    type: 'request_forbidden',
    code: 'unsupported_country_region_territory',
    message: 'Country, region, or territory not supported.'
  },
  {
    status: 404,
    type: 'invalid_request_error',
    code: 'model_not_found',
    message: 'The model does not exist or you do not have access to it.'
  },
  {
    status: 429,
    type: 'requests',
    code: 'rate_limit_exceeded',
    message: 'Rate limit reached for requests.'
  },
  {
    status: 500,
    type: 'server_error',
    code: 'server_error',
    message: 'The server had an error while processing your request.'
  },
  {
    status: 502,
    type: 'server_error',
    code: 'bad_gateway',
    message: 'Bad gateway.'
  },
  {
    status: 503,
    type: 'server_error',
    code: 'service_unavailable',
    message: 'The engine is currently overloaded, please try again later.'
  }
]

const userMessage = (content: unknown) => [{ role: 'user', content }]

// Copies an object without one of its keys.
const without = (
  source: Record<string, unknown>,
  key: string
): Record<string, unknown> =>
  Object.fromEntries(Object.entries(source).filter(([name]) => name !== key))

const invalidRequest = (message: string) => ({
  error: { message, type: 'invalid_request_error', code: 'invalid_request' }
})

describe('completions.controller', () => {
  let server: Server
  let baseUrl: string

  const complete = (body: object = SPEC_REQUEST) =>
    request(server).post(PATH).send(body)

  beforeAll(done => {
    // One listening server for the whole file, so an aborted client never
    // leaves an ephemeral supertest server behind.
    server = app.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo
      baseUrl = `http://127.0.0.1:${port}`
      done()
    })
  })

  afterAll(done => {
    server.closeAllConnections()
    server.close(() => done())
  })

  beforeEach(() => {
    jest.clearAllMocks()
    jest.mocked(wait).mockReset()
    state.reset()
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  describe('ok mode', () => {
    it('should answer ok with deterministic usage', async () => {
      const before = Math.floor(Date.now() / 1000)

      const response = await complete()

      expect(response.status).toBe(200)
      expect(response.headers['content-type']).toMatch(/application\/json/)
      expect(response.body).toEqual({
        id: expect.stringMatching(/^chatcmpl-sim-[0-9a-f]{32}$/),
        object: 'chat.completion',
        created: expect.any(Number),
        model: MODEL,
        choices: [
          {
            index: 0,
            message: { role: 'assistant', content: DEFAULT_CONTENT },
            finish_reason: 'stop'
          }
        ],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 }
      })
      expect(response.body.created).toBeGreaterThanOrEqual(before)
      expect(response.body.created).toBeLessThanOrEqual(
        Math.floor(Date.now() / 1000)
      )
      expect(wait).not.toHaveBeenCalled()
    })

    it('should answer the configured content in ok mode', async () => {
      state.setMode({ model: MODEL, mode: 'ok', content: 'Configured answer.' })

      const response = await complete()

      expect(response.status).toBe(200)
      expect(response.body.choices[0].message.content).toBe(
        'Configured answer.'
      )
      expect(response.body.usage.completion_tokens).toBe(5)
    })

    it('should echo the model of the request', async () => {
      const response = await complete({ ...SPEC_REQUEST, model: 'other-model' })

      expect(response.status).toBe(200)
      expect(response.body.model).toBe('other-model')
    })

    it('should log the model and the mode without the message content', async () => {
      await complete()

      expect(logger.info).toHaveBeenCalledTimes(1)
      expect(logger.info).toHaveBeenCalledWith(
        { model: MODEL, mode: 'ok', status: undefined, delay_ms: undefined },
        'Simulated completion'
      )
      expect(JSON.stringify(jest.mocked(logger.info).mock.calls)).not.toMatch(
        /Fui cobrado|Responda em JSON/
      )
    })

    it('should accept any or no Authorization header', async () => {
      const responses = [
        await complete(),
        await complete().set('Authorization', 'Bearer x'),
        await complete().set('Authorization', 'Basic y')
      ]

      expect(responses.map(response => response.status)).toEqual([
        200, 200, 200
      ])
      expect(state.getStats()[MODEL].calls).toBe(3)
    })
  })

  describe('token limit', () => {
    it('should cut the content at the token limit of the request', async () => {
      const cases = [
        { limits: { max_completion_tokens: 2 }, cut: true },
        { limits: { max_tokens: 2 }, cut: true },
        { limits: { max_completion_tokens: null, max_tokens: 2 }, cut: true },
        { limits: { max_completion_tokens: 256, max_tokens: 2 }, cut: false },
        { limits: { max_completion_tokens: 2, max_tokens: 256 }, cut: true },
        {
          limits: { max_completion_tokens: null, max_tokens: null },
          cut: false
        }
      ]

      for (const { limits, cut } of cases) {
        const response = await complete({
          model: MODEL,
          messages: SPEC_REQUEST.messages,
          ...limits
        })

        expect(response.status).toBe(200)
        expect(response.body.choices[0]).toEqual({
          index: 0,
          message: {
            role: 'assistant',
            content: cut ? 'Resposta' : DEFAULT_CONTENT
          },
          finish_reason: cut ? 'length' : 'stop'
        })
        expect(response.body.usage).toEqual(
          cut
            ? { prompt_tokens: 10, completion_tokens: 2, total_tokens: 12 }
            : { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 }
        )
      }
    })

    it('should not cut when no limit is sent', async () => {
      const response = await complete({
        model: MODEL,
        messages: SPEC_REQUEST.messages
      })

      expect(response.body.choices[0].message.content).toBe(DEFAULT_CONTENT)
      expect(response.body.choices[0].finish_reason).toBe('stop')
    })
  })

  describe('error mode', () => {
    it('should answer the configured error with the OpenAI body and Retry-After', async () => {
      expect(OPENAI_ERRORS.map(({ status }) => status)).toEqual([
        400, 401, 403, 404, 429, 500, 502, 503
      ])

      for (const { status, type, code, message } of OPENAI_ERRORS) {
        state.setMode({ model: MODEL, mode: 'error', status })

        const response = await complete()

        expect(response.status).toBe(status)
        expect(response.body).toEqual({ error: { message, type, code } })
        expect(response.headers['retry-after']).toBeUndefined()
      }

      for (const status of [429, 503]) {
        state.setMode({
          model: MODEL,
          mode: 'error',
          status,
          retry_after_seconds: 2
        })

        const response = await complete()

        expect(response.status).toBe(status)
        expect(response.headers['retry-after']).toBe('2')
        expect(response.body.error.code).toBe(
          status === 429 ? 'rate_limit_exceeded' : 'service_unavailable'
        )
      }
      expect(wait).not.toHaveBeenCalled()
    })

    it('should count a simulated 400 in the stats, unlike its own validation 400', async () => {
      state.setMode({ model: MODEL, mode: 'error', status: 400 })

      const rejected = await complete(without(SPEC_REQUEST, 'messages'))
      const simulated = await complete()

      expect(rejected.status).toBe(400)
      expect(rejected.body.error.code).toBe('invalid_request')
      expect(simulated.status).toBe(400)
      expect(simulated.body).toEqual({
        error: {
          message:
            'Unsupported parameter: this parameter is not supported with this model.',
          type: 'invalid_request_error',
          code: 'unsupported_parameter'
        }
      })
      expect(simulated.headers['retry-after']).toBeUndefined()
      const stats = await request(server).get('/control/stats')
      expect(stats.status).toBe(200)
      expect(stats.body.models).toEqual({
        [MODEL]: {
          calls: 1,
          requests: [
            {
              received_at: expect.any(String),
              mode: 'error',
              body: SPEC_REQUEST
            }
          ]
        }
      })
    })

    it('should send Retry-After 0 when retry_after_seconds is 0', async () => {
      state.setMode({
        model: MODEL,
        mode: 'error',
        status: 429,
        retry_after_seconds: 0
      })

      const response = await complete()

      expect(response.status).toBe(429)
      expect(response.headers['retry-after']).toBe('0')
    })

    it('should log the configured status', async () => {
      state.setMode({ model: MODEL, mode: 'error', status: 503 })

      await complete()

      expect(logger.info).toHaveBeenCalledWith(
        { model: MODEL, mode: 'error', status: 503, delay_ms: undefined },
        'Simulated completion'
      )
    })

    it('should send Retry-After and recover after times', async () => {
      state.setMode({
        model: MODEL,
        mode: 'error',
        status: 429,
        retry_after_seconds: 2,
        times: 1
      })

      const first = await complete()
      const second = await complete()

      expect(first.status).toBe(429)
      expect(first.headers['retry-after']).toBe('2')
      expect(second.status).toBe(200)
      expect(second.headers['retry-after']).toBeUndefined()
      expect(state.getStats()[MODEL].requests.map(r => r.mode)).toEqual([
        'error',
        'ok'
      ])
    })
  })

  describe('slow mode', () => {
    it('should wait delay_ms in slow mode', async () => {
      let abortedWhenCalled: boolean | undefined
      jest.mocked(wait).mockImplementation(async (_ms, signal) => {
        abortedWhenCalled = signal.aborted
      })
      const buildCompletion = jest.spyOn(completionService, 'buildCompletion')
      state.setMode({ model: MODEL, mode: 'slow', delay_ms: 15000 })

      const response = await complete()

      expect(wait).toHaveBeenCalledTimes(1)
      expect(wait).toHaveBeenCalledWith(15000, expect.any(AbortSignal))
      expect(abortedWhenCalled).toBe(false)
      // The same spy proves, in the cancel test, that nothing is built.
      expect(buildCompletion).toHaveBeenCalledTimes(1)
      expect(response.status).toBe(200)
      expect(response.body.choices[0].message.content).toBe(DEFAULT_CONTENT)
      expect(response.body.usage).toEqual({
        prompt_tokens: 10,
        completion_tokens: 5,
        total_tokens: 15
      })
      expect(logger.info).toHaveBeenCalledWith(
        { model: MODEL, mode: 'slow', status: undefined, delay_ms: 15000 },
        'Simulated completion'
      )
    })

    it('should answer the configured content after the wait in slow mode', async () => {
      state.setMode({
        model: MODEL,
        mode: 'slow',
        delay_ms: 0,
        content: 'Late answer.'
      })

      const response = await complete()

      expect(wait).toHaveBeenCalledWith(0, expect.any(AbortSignal))
      expect(response.status).toBe(200)
      expect(response.body.choices[0].message.content).toBe('Late answer.')
    })

    it('should count the slow call before the wait ends', async () => {
      let callsDuringWait: number | undefined
      jest.mocked(wait).mockImplementation(async () => {
        callsDuringWait = state.getStats()[MODEL]?.calls
      })
      state.setMode({ model: MODEL, mode: 'slow', delay_ms: 15000 })

      await complete()

      expect(callsDuringWait).toBe(1)
    })

    it('should cancel the slow wait when the client closes', async () => {
      let waitSignal: AbortSignal | undefined
      let waitEnded: Promise<void> | undefined
      let markStarted: () => void = () => undefined
      const started = new Promise<void>(resolve => {
        markStarted = resolve
      })
      // The mocked wait only ends when its signal aborts.
      jest.mocked(wait).mockImplementation((_ms, signal) => {
        waitSignal = signal
        waitEnded = new Promise<void>(resolve => {
          signal.addEventListener('abort', () => resolve(), { once: true })
        })
        markStarted()
        return waitEnded
      })
      const buildCompletion = jest.spyOn(completionService, 'buildCompletion')
      const responseContent = jest.spyOn(completionService, 'responseContent')
      state.setMode({ model: MODEL, mode: 'slow', delay_ms: 15000 })
      const client = new AbortController()

      const call = fetch(`${baseUrl}${PATH}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(SPEC_REQUEST),
        signal: client.signal
      })
      await started
      expect(waitSignal?.aborted).toBe(false)

      client.abort()

      await expect(call).rejects.toThrow()
      await waitEnded
      // Lets the controller resume after the wait before asserting.
      await new Promise(resolve => setImmediate(resolve))
      expect(waitSignal?.aborted).toBe(true)
      expect(buildCompletion).not.toHaveBeenCalled()
      expect(responseContent).not.toHaveBeenCalled()
      expect(logger.error).not.toHaveBeenCalled()
      expect(state.getStats()[MODEL].calls).toBe(1)
      expect(state.getStats()[MODEL].requests[0].mode).toBe('slow')

      // The server keeps serving after the abandoned call.
      jest.mocked(wait).mockReset()
      const next = await complete({ ...SPEC_REQUEST, model: 'other' })
      expect(next.status).toBe(200)
    })
  })

  describe('timeout mode', () => {
    it('should not answer in timeout mode', async () => {
      state.setMode({ model: MODEL, mode: 'timeout' })
      const buildCompletion = jest.spyOn(completionService, 'buildCompletion')

      await expect(complete().timeout(200)).rejects.toMatchObject({
        timeout: 200
      })

      const stats = await request(server).get('/control/stats')
      expect(stats.status).toBe(200)
      expect(stats.body.models[MODEL].calls).toBe(1)
      expect(stats.body.models[MODEL].requests[0].mode).toBe('timeout')
      expect(wait).not.toHaveBeenCalled()
      expect(buildCompletion).not.toHaveBeenCalled()
      expect(logger.error).not.toHaveBeenCalled()
    })
  })

  describe('fenced-json and invalid-json modes', () => {
    it('should answer text that is not JSON in invalid-json mode', async () => {
      state.setMode({ model: MODEL, mode: 'invalid-json' })
      const byDefault = await complete()
      state.setMode({
        model: MODEL,
        mode: 'invalid-json',
        content: 'category = billing'
      })
      const configured = await complete()

      expect(byDefault.status).toBe(200)
      expect(byDefault.body.choices[0].message.content).toBe(
        DEFAULT_INVALID_JSON
      )
      expect(() =>
        JSON.parse(byDefault.body.choices[0].message.content)
      ).toThrow(SyntaxError)
      expect(configured.status).toBe(200)
      expect(configured.body.choices[0].message.content).toBe(
        'category = billing'
      )
      expect(() =>
        JSON.parse(configured.body.choices[0].message.content)
      ).toThrow(SyntaxError)
    })

    it('should send valid JSON fenced as json in fenced-json mode', async () => {
      state.setMode({ model: MODEL, mode: 'fenced-json' })

      const response = await complete()

      const content: string = response.body.choices[0].message.content
      expect(response.status).toBe(200)
      expect(content.startsWith(`${FENCE}json\n`)).toBe(true)
      expect(content.endsWith(`\n${FENCE}`)).toBe(true)
      expect(JSON.parse(content.slice(8, -4))).toEqual({
        category: 'billing',
        reason: 'Cobrança duplicada na assinatura.'
      })
      // The completion tokens count the fences too.
      expect(response.body.usage.completion_tokens).toBe(
        Math.ceil(Array.from(content).length / 4)
      )
    })
  })

  describe('validation', () => {
    it('should reject an invalid request without counting it', async () => {
      state.setMode({ model: MODEL, mode: 'error', status: 503, times: 1 })
      const cases = [
        {
          body: without(SPEC_REQUEST, 'model'),
          message: "The field 'model' is required."
        },
        {
          body: { ...SPEC_REQUEST, messages: [] },
          message: "The field 'messages' must have at least 1 item."
        },
        {
          body: { ...SPEC_REQUEST, max_tokens: 0 },
          message: "The field 'max_tokens' must be an integer of at least 1."
        },
        {
          body: [SPEC_REQUEST],
          message: 'The request body must be a JSON object.'
        }
      ]

      for (const { body, message } of cases) {
        const response = await complete(body)

        expect(response.status).toBe(400)
        expect(response.body).toEqual(invalidRequest(message))
      }
      expect(state.getStats()).toEqual({})
      // A rejected call does not spend the configured times either.
      expect(state.listModes()[MODEL].remaining_calls).toBe(1)
      expect(logger.info).not.toHaveBeenCalled()
    })

    it.each([
      ['an empty model', { model: '' }, "The field 'model' is invalid."],
      [
        'a model of 201 characters',
        { model: 'm'.repeat(201) },
        "The field 'model' is invalid."
      ],
      ['a numeric model', { model: 5 }, "The field 'model' is invalid."],
      [
        'messages that is not a list',
        { messages: 'hi' },
        "The field 'messages' is invalid."
      ],
      [
        'a message that is not an object',
        { messages: ['hi'] },
        "The field 'messages.0' is invalid."
      ],
      [
        'a message without role',
        { messages: [{ content: 'Oi' }] },
        "The field 'messages.0.role' is required."
      ],
      [
        'a message with a numeric content',
        { messages: [{ role: 'user', content: 5 }] },
        "The field 'messages.0.content' is invalid."
      ],
      [
        'a decimal max_completion_tokens',
        { max_completion_tokens: 1.5 },
        "The field 'max_completion_tokens' must be an integer of at least 1."
      ],
      [
        'a max_completion_tokens sent as a string',
        { max_completion_tokens: '2' },
        "The field 'max_completion_tokens' must be an integer of at least 1."
      ],
      [
        'a negative max_tokens',
        { max_tokens: -1 },
        "The field 'max_tokens' must be an integer of at least 1."
      ]
    ])(
      'should answer 400 invalid_request for %s',
      async (_label, change, message) => {
        const response = await complete({ ...SPEC_REQUEST, ...change })

        expect(response.status).toBe(400)
        expect(response.body).toEqual(invalidRequest(message))
        expect(state.getStats()).toEqual({})
      }
    )

    it('should answer 400 invalid_request when messages is missing', async () => {
      const response = await complete(without(SPEC_REQUEST, 'messages'))

      expect(response.status).toBe(400)
      expect(response.body).toEqual(
        invalidRequest("The field 'messages' is required.")
      )
    })

    it('should accept 1000 messages and reject 1001', async () => {
      const messages = Array.from({ length: 1000 }, () => ({
        role: 'user',
        content: 'a'
      }))

      const accepted = await complete({ model: MODEL, messages })
      const rejected = await complete({
        model: MODEL,
        messages: [...messages, { role: 'user', content: 'a' }]
      })

      expect(accepted.status).toBe(200)
      expect(accepted.body.usage.prompt_tokens).toBe(250)
      expect(rejected.status).toBe(400)
      expect(rejected.body).toEqual(
        invalidRequest("The field 'messages' must have at most 1000 items.")
      )
      expect(state.getStats()[MODEL].calls).toBe(1)
    })

    it('should accept a model of 200 characters and the content forms of the spec', async () => {
      const model = 'm'.repeat(200)

      const response = await complete({
        model,
        messages: [
          { role: 'system', content: '' },
          { role: 'assistant', content: null, name: 'helper' },
          {
            role: 'user',
            content: [
              { type: 'text', text: 'abcd' },
              { type: 'image_url', image_url: { url: 'https://x.test/a.png' } }
            ]
          },
          { role: 'user' }
        ],
        temperature: 0.2,
        stop: ['\n']
      })

      expect(response.status).toBe(200)
      expect(response.body.model).toBe(model)
      expect(response.body.usage.prompt_tokens).toBe(1)
    })
  })

  describe('recording', () => {
    it('should record the body and the applied mode', async () => {
      const body = {
        ...SPEC_REQUEST,
        messages: userMessage('Oi'),
        temperature: 0.3
      }
      state.setMode({ model: MODEL, mode: 'error', status: 503, times: 1 })

      const failed = await complete(body)
      const succeeded = await complete(body)

      expect(failed.status).toBe(503)
      expect(succeeded.status).toBe(200)
      const stats = state.getStats()[MODEL]
      expect(stats.calls).toBe(2)
      expect(stats.requests).toEqual([
        { received_at: expect.any(String), mode: 'error', body },
        { received_at: expect.any(String), mode: 'ok', body }
      ])
      expect(stats.requests[0].received_at).toMatch(
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
      )
    })

    it('should not record any header', async () => {
      await complete().set('Authorization', 'Bearer secret-token')

      expect(JSON.stringify(state.getStats())).not.toContain('secret-token')
    })
  })

  describe('unexpected errors', () => {
    it('should pass an unexpected error to the error handler as 500 internal_error', async () => {
      const failure = new Error('state failure')
      jest.spyOn(state, 'takeMode').mockImplementation(() => {
        throw failure
      })

      const response = await complete()

      expect(response.status).toBe(500)
      expect(response.body).toEqual({
        error: {
          message: 'Internal error.',
          type: 'server_error',
          code: 'internal_error'
        }
      })
      expect(logger.error).toHaveBeenCalledWith(
        { err: failure },
        'Unhandled error'
      )
      expect(state.getStats()).toEqual({})
    })

    it('should pass a failure of the slow wait to the error handler', async () => {
      jest.mocked(wait).mockRejectedValue(new Error('timer failure'))
      state.setMode({ model: MODEL, mode: 'slow', delay_ms: 10 })

      const response = await complete()

      expect(response.status).toBe(500)
      expect(response.body.error.code).toBe('internal_error')
    })
  })
})
