import {
  buildCompletion,
  countTokens,
  promptText,
  responseContent,
  simulatedError,
  type ChatMessage
} from '../../../src/services/completion.service'

const FENCE = '```'
const DEFAULT_CONTENT = 'Resposta simulada.'
const DEFAULT_JSON =
  '{"category": "billing", "reason": "Cobrança duplicada na assinatura."}'
const DEFAULT_INVALID_JSON =
  'Categoria: billing. Motivo: cobrança duplicada na assinatura.'

// The messages of the spec §5 request: 17 + 23 = 40 characters (10 tokens).
const SPEC_MESSAGES: ChatMessage[] = [
  { role: 'system', content: 'Responda em JSON.' },
  { role: 'user', content: 'Fui cobrado duas vezes.' }
]

const NOW = new Date('2026-10-04T15:00:00.999Z')

// Returns the text between the opening and closing json fences.
const fencedBody = (content: string): string => {
  const opening = `${FENCE}json\n`
  const closing = `\n${FENCE}`
  expect(content.startsWith(opening)).toBe(true)
  expect(content.endsWith(closing)).toBe(true)
  return content.slice(opening.length, content.length - closing.length)
}

describe('completion.service', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('countTokens', () => {
    it('should count characters as code points rounded up', () => {
      const texts = ['', 'abc', 'abcd', 'abcde', 'ação', '\u{1F600}']

      expect(texts.map(countTokens)).toEqual([0, 1, 1, 2, 1, 1])
    })

    it('should count an emoji as one character, not as two UTF-16 units', () => {
      // Five emoji are 5 code points (2 tokens) but 10 UTF-16 units (3 tokens).
      const emoji = '\u{1F600}'.repeat(5)
      expect(emoji.length).toBe(10)

      expect(countTokens(emoji)).toBe(2)
      expect(countTokens('Resposta simulada.')).toBe(5)
    })
  })

  describe('promptText', () => {
    it('should join the content of every message', () => {
      const parts = [
        { type: 'text', text: 'cd' },
        { type: 'image_url', image_url: { url: 'https://example.test/a.png' } },
        { type: 'text', text: 'ef' }
      ]
      const messages: ChatMessage[] = [
        { role: 'system', content: 'ab' },
        { role: 'user', content: parts },
        { role: 'assistant', content: null }
      ]

      expect(promptText(messages)).toBe('abcdef')
    })

    it('should join the messages without a separator', () => {
      expect(promptText(SPEC_MESSAGES)).toBe(
        'Responda em JSON.Fui cobrado duas vezes.'
      )
      expect(countTokens(promptText(SPEC_MESSAGES))).toBe(10)
    })

    it('should count an absent content or an empty list as nothing', () => {
      expect(
        promptText([
          { role: 'assistant' },
          { role: 'user', content: [] },
          { role: 'user', content: '' }
        ])
      ).toBe('')
    })

    it('should ignore parts that are not text parts with a string text', () => {
      // Joi accepts any list in content, so the parts can be anything.
      const parts = [
        null,
        'loose string',
        42,
        { text: 'no type' },
        { type: 'text' },
        { type: 'text', text: 7 },
        { type: 'input_text', text: 'other type' },
        { type: 'text', text: 'kept' }
      ] as unknown as ChatMessage['content']

      expect(promptText([{ role: 'user', content: parts }])).toBe('kept')
    })

    it('should answer an empty text for no messages', () => {
      expect(promptText([])).toBe('')
    })
  })

  describe('responseContent', () => {
    it.each([
      [{ mode: 'ok' as const }, DEFAULT_CONTENT],
      [{ mode: 'ok' as const, content: 'Configured.' }, 'Configured.'],
      [{ mode: 'slow' as const, delay_ms: 10 }, DEFAULT_CONTENT],
      [{ mode: 'slow' as const, delay_ms: 10, content: 'Late.' }, 'Late.'],
      [{ mode: 'invalid-json' as const }, DEFAULT_INVALID_JSON],
      [{ mode: 'invalid-json' as const, content: 'not json' }, 'not json']
    ])('should answer the content of %p', (config, expected) => {
      expect(responseContent(config)).toBe(expected)
    })

    it('should wrap JSON in a json code fence', () => {
      const byDefault = responseContent({ mode: 'fenced-json' })
      const configured = responseContent({
        mode: 'fenced-json',
        content: '{"a": [1, 2]}'
      })

      expect(byDefault).toBe(`${FENCE}json\n${DEFAULT_JSON}\n${FENCE}`)
      expect(JSON.parse(fencedBody(byDefault))).toEqual({
        category: 'billing',
        reason: 'Cobrança duplicada na assinatura.'
      })
      expect(configured).toBe('```json\n{"a": [1, 2]}\n```')
      expect(JSON.parse(fencedBody(configured))).toEqual({ a: [1, 2] })
    })

    it('should answer default invalid-json text that JSON.parse rejects', () => {
      expect(() =>
        JSON.parse(responseContent({ mode: 'invalid-json' }))
      ).toThrow(SyntaxError)
    })
  })

  describe('simulatedError', () => {
    it.each([
      [
        400,
        'invalid_request_error',
        'unsupported_parameter',
        'Unsupported parameter: this parameter is not supported with this model.'
      ],
      [
        401,
        'invalid_request_error',
        'invalid_api_key',
        'Incorrect API key provided.'
      ],
      [
        403,
        'request_forbidden',
        'unsupported_country_region_territory',
        'Country, region, or territory not supported.'
      ],
      [
        404,
        'invalid_request_error',
        'model_not_found',
        'The model does not exist or you do not have access to it.'
      ],
      [
        429,
        'requests',
        'rate_limit_exceeded',
        'Rate limit reached for requests.'
      ],
      [
        500,
        'server_error',
        'server_error',
        'The server had an error while processing your request.'
      ],
      [502, 'server_error', 'bad_gateway', 'Bad gateway.'],
      [
        503,
        'server_error',
        'service_unavailable',
        'The engine is currently overloaded, please try again later.'
      ]
    ])(
      'should describe status %i as the OpenAI error (%s, %s)',
      (status, type, code, message) => {
        expect(simulatedError(status)).toEqual({ type, code, message })
      }
    )

    it('should answer undefined for a status outside the table', () => {
      // 418 and 504 are valid HTTP statuses that the spec §5 table leaves out.
      expect(simulatedError(418)).toBeUndefined()
      expect(simulatedError(504)).toBeUndefined()
    })
  })

  describe('buildCompletion', () => {
    it('should build an OpenAI chat completion', () => {
      const completion = buildCompletion({
        model: 'gpt-4.1-mini',
        messages: SPEC_MESSAGES,
        content: DEFAULT_CONTENT,
        limit: null,
        now: NOW
      })

      expect(completion).toEqual({
        id: expect.stringMatching(/^chatcmpl-sim-[0-9a-f]{32}$/),
        object: 'chat.completion',
        created: 1791126000,
        model: 'gpt-4.1-mini',
        choices: [
          {
            index: 0,
            message: { role: 'assistant', content: DEFAULT_CONTENT },
            finish_reason: 'stop'
          }
        ],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 }
      })
      expect(Object.keys(completion)).toEqual([
        'id',
        'object',
        'created',
        'model',
        'choices',
        'usage'
      ])
    })

    it('should draw a new random id for every completion', () => {
      const input = {
        model: 'm',
        messages: SPEC_MESSAGES,
        content: DEFAULT_CONTENT,
        limit: null
      }

      const ids = new Set(
        Array.from({ length: 10 }, () => buildCompletion(input).id)
      )

      expect(ids.size).toBe(10)
    })

    it('should use the current time in Unix seconds when no time is given', () => {
      const before = Math.floor(Date.now() / 1000)

      const { created } = buildCompletion({
        model: 'm',
        messages: SPEC_MESSAGES,
        content: DEFAULT_CONTENT,
        limit: null
      })

      expect(created).toBeGreaterThanOrEqual(before)
      expect(created).toBeLessThanOrEqual(Math.floor(Date.now() / 1000))
    })

    it('should cut the content at the token limit', () => {
      const build = (limit: number | null) =>
        buildCompletion({
          model: 'm',
          messages: SPEC_MESSAGES,
          content: DEFAULT_CONTENT,
          limit,
          now: NOW
        })

      const cut = build(2)
      expect(cut.choices[0].message.content).toBe('Resposta')
      expect(cut.choices[0].finish_reason).toBe('length')
      expect(cut.usage).toEqual({
        prompt_tokens: 10,
        completion_tokens: 2,
        total_tokens: 12
      })

      const almost = build(4)
      expect(almost.choices[0].message.content).toBe('Resposta simulad')
      expect(almost.choices[0].finish_reason).toBe('length')
      expect(almost.usage.completion_tokens).toBe(4)

      // 18 characters are exactly 5 tokens, so a limit of 5 does not cut.
      const exact = build(5)
      expect(exact.choices[0].message.content).toBe(DEFAULT_CONTENT)
      expect(exact.choices[0].finish_reason).toBe('stop')
      expect(exact.usage.completion_tokens).toBe(5)

      const larger = build(256)
      expect(larger.choices[0].message.content).toBe(DEFAULT_CONTENT)
      expect(larger.choices[0].finish_reason).toBe('stop')
      expect(larger.usage.total_tokens).toBe(15)

      const none = build(null)
      expect(none.choices[0].message.content).toBe(DEFAULT_CONTENT)
      expect(none.choices[0].finish_reason).toBe('stop')
    })

    it('should cut at whole code points, never in the middle of an emoji', () => {
      const emoji = '\u{1F600}'
      const completion = buildCompletion({
        model: 'm',
        messages: [],
        content: emoji.repeat(9),
        limit: 2
      })

      expect(completion.choices[0].message.content).toBe(emoji.repeat(8))
      expect(completion.choices[0].finish_reason).toBe('length')
      expect(completion.usage).toEqual({
        prompt_tokens: 0,
        completion_tokens: 2,
        total_tokens: 2
      })
    })

    it('should count the fences of fenced-json in the completion tokens', () => {
      const content = responseContent({ mode: 'fenced-json' })

      const completion = buildCompletion({
        model: 'm',
        messages: SPEC_MESSAGES,
        content,
        limit: null
      })

      expect(completion.usage.completion_tokens).toBe(
        Math.ceil(Array.from(content).length / 4)
      )
      expect(completion.usage.completion_tokens).toBeGreaterThan(
        countTokens(DEFAULT_JSON)
      )
    })

    it('should not cut an empty content', () => {
      const completion = buildCompletion({
        model: 'm',
        messages: SPEC_MESSAGES,
        content: '',
        limit: 1
      })

      expect(completion.choices[0].message.content).toBe('')
      expect(completion.choices[0].finish_reason).toBe('stop')
      expect(completion.usage.completion_tokens).toBe(0)
    })
  })
})
