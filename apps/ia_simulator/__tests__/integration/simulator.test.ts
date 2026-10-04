import {
  startSimulator,
  type SimulatorProcess
} from '../utils/simulator-process'

// One real simulator process per file, reached only over HTTP. Each test
// starts from a clean state through POST /control/reset.
const MODEL = 'gpt-4.1-mini'

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

type Completion = {
  id: string
  object: string
  model: string
  choices: Array<{
    message: { role: string; content: string }
    finish_reason: string
  }>
  usage: {
    prompt_tokens: number
    completion_tokens: number
    total_tokens: number
  }
}

type Stats = {
  models: Record<string, { calls: number; requests: unknown[] }>
}

describe('simulator process', () => {
  let simulator: SimulatorProcess

  const post = (
    path: string,
    body: unknown,
    init: RequestInit = {}
  ): Promise<Response> =>
    fetch(`${simulator.baseUrl}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      ...init
    })

  const setMode = async (mode: Record<string, unknown>): Promise<void> => {
    const response = await post('/control/modes', { model: MODEL, ...mode })
    expect(response.status).toBe(200)
  }

  const complete = (
    body: unknown = SPEC_REQUEST,
    init: RequestInit = {}
  ): Promise<Response> => post('/v1/chat/completions', body, init)

  const stats = async (): Promise<Stats> =>
    (await fetch(`${simulator.baseUrl}/control/stats`)).json()

  beforeAll(async () => {
    simulator = await startSimulator()
  })

  afterAll(async () => {
    await simulator?.stop()
  })

  beforeEach(async () => {
    const response = await post('/control/reset', {})
    expect(response.status).toBe(204)
  })

  it('should start on a free port and answer the health check', async () => {
    const response = await fetch(`${simulator.baseUrl}/health/live`)

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ status: 'ok' })
  })

  it('should answer an unknown route with the OpenAI error format', async () => {
    const response = await fetch(`${simulator.baseUrl}/nope`)

    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({
      error: {
        message: 'Unknown route.',
        type: 'invalid_request_error',
        code: 'not_found'
      }
    })
  })

  it('should answer ok with deterministic usage over HTTP', async () => {
    const response = await complete()
    const body = (await response.json()) as Completion

    expect(response.status).toBe(200)
    expect(body.id).toMatch(/^chatcmpl-sim-[0-9a-f]{32}$/)
    expect(body.object).toBe('chat.completion')
    expect(body.model).toBe(MODEL)
    expect(body.choices[0].message).toEqual({
      role: 'assistant',
      content: 'Resposta simulada.'
    })
    expect(body.choices[0].finish_reason).toBe('stop')
    expect(body.usage).toEqual({
      prompt_tokens: 10,
      completion_tokens: 5,
      total_tokens: 15
    })
  })

  it('should answer 503 to every call and count each one', async () => {
    await setMode({ mode: 'error', status: 503 })

    const statuses: number[] = []
    for (let call = 0; call < 3; call += 1) {
      const response = await complete()
      statuses.push(response.status)
      expect(await response.json()).toEqual({
        error: {
          message:
            'The engine is currently overloaded, please try again later.',
          type: 'server_error',
          code: 'service_unavailable'
        }
      })
    }

    expect(statuses).toEqual([503, 503, 503])
    expect((await stats()).models[MODEL].calls).toBe(3)
  })

  it('should hold the answer for 15 s in slow mode', async () => {
    await setMode({ mode: 'slow', delay_ms: 15000 })

    const startedAt = Date.now()
    const response = await complete()
    const elapsed = Date.now() - startedAt

    expect(response.status).toBe(200)
    expect(elapsed).toBeGreaterThanOrEqual(15000)
    expect(elapsed).toBeLessThan(20000)
  })

  it('should never answer in timeout mode and keep serving', async () => {
    await setMode({ mode: 'timeout' })

    // The client gives up after 1 s: the simulator must not have answered.
    await expect(
      complete(SPEC_REQUEST, { signal: AbortSignal.timeout(1000) })
    ).rejects.toThrow()

    const other = await complete({ ...SPEC_REQUEST, model: 'gemini-2.5-flash' })
    expect(other.status).toBe(200)
    expect((await stats()).models[MODEL].calls).toBe(1)
  })

  it('should send valid JSON fenced as json', async () => {
    await setMode({ mode: 'fenced-json' })

    const response = await complete()
    const { content } = ((await response.json()) as Completion).choices[0]
      .message

    expect(response.status).toBe(200)
    expect(content.startsWith('```json\n')).toBe(true)
    expect(content.endsWith('\n```')).toBe(true)
    expect(
      JSON.parse(content.slice('```json\n'.length, -'\n```'.length))
    ).toEqual({
      category: 'billing',
      reason: 'Cobrança duplicada na assinatura.'
    })
  })

  it('should send Retry-After and recover after times', async () => {
    await setMode({
      mode: 'error',
      status: 429,
      retry_after_seconds: 2,
      times: 1
    })

    const limited = await complete()
    expect(limited.status).toBe(429)
    expect(limited.headers.get('retry-after')).toBe('2')

    const recovered = await complete()
    expect(recovered.status).toBe(200)
  })
})
