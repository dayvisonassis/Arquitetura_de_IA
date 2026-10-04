import {
  getStats,
  listModes,
  MODES,
  recordCall,
  reset,
  setMode,
  takeMode
} from '../../../src/services/simulation-state.service'

const MODEL = 'gpt-4.1-mini'

describe('simulation-state.service', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    // The state lives at module level and is shared by every test.
    reset()
  })

  it('should list the six modes of the spec', () => {
    expect(MODES).toEqual([
      'ok',
      'error',
      'slow',
      'timeout',
      'fenced-json',
      'invalid-json'
    ])
  })

  describe('setMode', () => {
    it('should return the stored mode with remaining_calls null when there is no times', () => {
      const stored = setMode({ model: MODEL, mode: 'slow', delay_ms: 15000 })

      expect(stored).toEqual({
        model: MODEL,
        mode: 'slow',
        delay_ms: 15000,
        remaining_calls: null
      })
    })

    it('should return the stored mode with remaining_calls equal to times', () => {
      const stored = setMode({
        model: MODEL,
        mode: 'error',
        status: 503,
        retry_after_seconds: 2,
        times: 3
      })

      expect(stored).toEqual({
        model: MODEL,
        mode: 'error',
        status: 503,
        retry_after_seconds: 2,
        remaining_calls: 3
      })
    })

    it('should store the configuration without model and times', () => {
      setMode({ model: MODEL, mode: 'ok', content: 'Hi.', times: 2 })

      expect(takeMode(MODEL)).toEqual({ mode: 'ok', content: 'Hi.' })
    })

    it('should replace the mode of a model', () => {
      setMode({ model: MODEL, mode: 'error', status: 503, times: 5 })
      setMode({ model: MODEL, mode: 'slow', delay_ms: 100 })

      expect(takeMode(MODEL)).toEqual({ mode: 'slow', delay_ms: 100 })
      expect(listModes()).toEqual({
        [MODEL]: { mode: 'slow', delay_ms: 100, remaining_calls: null }
      })
    })

    it('should not change the stats when a mode is replaced', () => {
      recordCall(MODEL, 'ok', { model: MODEL })
      const before = getStats()

      setMode({ model: MODEL, mode: 'timeout' })
      setMode({ model: MODEL, mode: 'ok' })

      expect(getStats()).toEqual(before)
    })
  })

  describe('takeMode', () => {
    it('should answer ok for a model without a configured mode', () => {
      expect(takeMode('never-configured')).toEqual({ mode: 'ok' })
      expect(listModes()).toEqual({})
    })

    it('should compare the model name exactly, including the case', () => {
      setMode({ model: MODEL, mode: 'timeout' })

      expect(takeMode('GPT-4.1-MINI')).toEqual({ mode: 'ok' })
      expect(takeMode(`${MODEL} `)).toEqual({ mode: 'ok' })
      expect(takeMode(MODEL)).toEqual({ mode: 'timeout' })
    })

    it('should keep a mode without times for every call', () => {
      setMode({ model: MODEL, mode: 'error', status: 500 })

      for (let call = 0; call < 5; call += 1) {
        expect(takeMode(MODEL)).toEqual({ mode: 'error', status: 500 })
      }
      expect(listModes()[MODEL].remaining_calls).toBeNull()
    })

    it('should return to ok after the configured number of calls', () => {
      const stored = setMode({
        model: MODEL,
        mode: 'error',
        status: 429,
        times: 2
      })
      expect(stored.remaining_calls).toBe(2)

      expect(takeMode(MODEL)).toEqual({ mode: 'error', status: 429 })
      expect(listModes()[MODEL].remaining_calls).toBe(1)

      expect(takeMode(MODEL)).toEqual({ mode: 'error', status: 429 })
      expect(listModes()).toEqual({})

      expect(takeMode(MODEL)).toEqual({ mode: 'ok' })
    })

    it('should remove a mode with times 1 on the first call', () => {
      setMode({ model: MODEL, mode: 'timeout', times: 1 })

      expect(takeMode(MODEL)).toEqual({ mode: 'timeout' })
      expect(listModes()).toEqual({})
      expect(takeMode(MODEL)).toEqual({ mode: 'ok' })
    })

    it('should only spend the times of the model that is called', () => {
      setMode({ model: MODEL, mode: 'timeout', times: 2 })
      setMode({ model: 'other', mode: 'timeout', times: 2 })

      takeMode(MODEL)

      expect(listModes()).toEqual({
        [MODEL]: { mode: 'timeout', remaining_calls: 1 },
        other: { mode: 'timeout', remaining_calls: 2 }
      })
    })
  })

  describe('recordCall and getStats', () => {
    it('should start with no stats', () => {
      expect(getStats()).toEqual({})
    })

    it('should record the arrival time in UTC with milliseconds, the mode and the body', () => {
      const body = { model: MODEL, messages: [{ role: 'user', content: 'Oi' }] }

      recordCall(MODEL, 'error', body, new Date('2026-10-04T15:00:00.123Z'))

      expect(getStats()).toEqual({
        [MODEL]: {
          calls: 1,
          requests: [
            { received_at: '2026-10-04T15:00:00.123Z', mode: 'error', body }
          ]
        }
      })
    })

    it('should use the current time when no arrival time is given', () => {
      const before = Date.now()

      recordCall(MODEL, 'ok', {})

      const after = Date.now()
      const receivedAt = getStats()[MODEL].requests[0].received_at
      expect(receivedAt).toMatch(
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
      )
      expect(Date.parse(receivedAt)).toBeGreaterThanOrEqual(before)
      expect(Date.parse(receivedAt)).toBeLessThanOrEqual(after)
    })

    it('should count every call and keep only the 20 most recent requests', () => {
      for (let call = 1; call <= 25; call += 1) {
        recordCall(MODEL, 'ok', { call })
      }

      const stats = getStats()[MODEL]
      expect(stats.calls).toBe(25)
      expect(stats.requests).toHaveLength(20)
      expect(stats.requests.map(request => request.body)).toEqual(
        Array.from({ length: 20 }, (_, index) => ({ call: index + 6 }))
      )
    })

    it('should keep exactly 20 requests at the limit', () => {
      for (let call = 1; call <= 20; call += 1) {
        recordCall(MODEL, 'ok', { call })
      }

      const stats = getStats()[MODEL]
      expect(stats.calls).toBe(20)
      expect(stats.requests[0].body).toEqual({ call: 1 })
      expect(stats.requests[19].body).toEqual({ call: 20 })
    })

    it('should keep the stats of each model apart', () => {
      recordCall(MODEL, 'ok', { n: 1 })
      recordCall('other', 'timeout', { n: 2 })
      recordCall(MODEL, 'slow', { n: 3 })

      const stats = getStats()
      expect(stats[MODEL].calls).toBe(2)
      expect(stats[MODEL].requests.map(request => request.mode)).toEqual([
        'ok',
        'slow'
      ])
      expect(stats.other.calls).toBe(1)
      expect(stats.other.requests[0].mode).toBe('timeout')
    })
  })

  describe('listModes', () => {
    it('should list an ok mode that was configured explicitly', () => {
      setMode({ model: MODEL, mode: 'ok' })

      expect(listModes()).toEqual({
        [MODEL]: { mode: 'ok', remaining_calls: null }
      })
    })

    it('should list every configured model with its fields', () => {
      setMode({ model: 'a', mode: 'fenced-json', content: '{"a":1}' })
      setMode({ model: 'b', mode: 'invalid-json', times: 4 })

      expect(listModes()).toEqual({
        a: { mode: 'fenced-json', content: '{"a":1}', remaining_calls: null },
        b: { mode: 'invalid-json', remaining_calls: 4 }
      })
    })
  })

  describe('reset', () => {
    it('should clear modes and stats on reset', () => {
      setMode({ model: MODEL, mode: 'timeout', times: 3 })
      setMode({ model: 'other', mode: 'ok' })
      recordCall(MODEL, 'timeout', { model: MODEL })

      reset()

      expect(listModes()).toEqual({})
      expect(getStats()).toEqual({})
      expect(takeMode(MODEL)).toEqual({ mode: 'ok' })
    })
  })

  describe('copies', () => {
    it('should not expose its internal structures', () => {
      setMode({ model: MODEL, mode: 'ok', content: 'Original.', times: 2 })
      recordCall(MODEL, 'ok', { model: MODEL, nested: { value: 1 } })

      const stats = getStats()
      stats[MODEL].calls = 99
      stats[MODEL].requests.push({
        received_at: 'x',
        mode: 'error',
        body: null
      })
      const firstBody = stats[MODEL].requests[0].body as {
        nested: { value: number }
      }
      firstBody.nested.value = 2
      delete stats[MODEL]
      const modes = listModes()
      const listed = modes[MODEL]
      listed.remaining_calls = 50
      if (listed.mode === 'ok') {
        listed.content = 'Changed.'
      }
      modes.added = { mode: 'timeout', remaining_calls: null }

      expect(getStats()).toEqual({
        [MODEL]: {
          calls: 1,
          requests: [
            {
              received_at: expect.any(String),
              mode: 'ok',
              body: { model: MODEL, nested: { value: 1 } }
            }
          ]
        }
      })
      expect(listModes()).toEqual({
        [MODEL]: { mode: 'ok', content: 'Original.', remaining_calls: 2 }
      })
    })

    it('should copy the recorded body, so later changes to it are not seen', () => {
      const body = { messages: [{ role: 'user', content: 'Oi' }] }

      recordCall(MODEL, 'ok', body)
      body.messages[0].content = 'Changed'

      expect(getStats()[MODEL].requests[0].body).toEqual({
        messages: [{ role: 'user', content: 'Oi' }]
      })
    })

    it('should return copies from setMode and takeMode', () => {
      const stored = setMode({ model: MODEL, mode: 'ok', content: 'Original.' })
      stored.remaining_calls = 7

      const taken = takeMode(MODEL)
      if (taken.mode === 'ok') {
        taken.content = 'Changed.'
      }

      expect(takeMode(MODEL)).toEqual({ mode: 'ok', content: 'Original.' })
      expect(listModes()[MODEL].remaining_calls).toBeNull()
    })
  })
})
