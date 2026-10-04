// The loader would read the local .env.testing; unit tests build the env by hand.
jest.mock('../../../loader', () => ({}))
// Catalog files are served from memory; the versioned file goes through the real fs.
jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  readFileSync: jest.fn()
}))

import fs, { readFileSync } from 'fs'
import path from 'path'
import {
  assertCatalog,
  CatalogError,
  getCatalog
} from '../../../src/config/catalog'

type Json = Record<string, unknown>

const realFs = jest.requireActual<typeof fs>('fs')
const mockedRead = jest.mocked(readFileSync)

const ENV: Record<string, string> = Object.freeze({
  OPENAI_API_KEY: 'sk-test-fictitious-openai',
  GEMINI_API_KEY: 'gemini-test-fictitious',
  CATALOG_FILE: 'catalog/test.json'
})

const PRD_CAPABILITIES = [
  'developer-assistant',
  'architecture-advisor',
  'ticket-classifier'
]

const openai = (overrides: Json = {}): Json => ({
  name: 'openai-gpt-4-1-mini',
  provider: 'openai',
  model: 'gpt-4.1-mini',
  credential_env: 'OPENAI_API_KEY',
  params: ['max_tokens', 'temperature'],
  param_mappings: { max_tokens: 'max_completion_tokens' },
  price_per_million_tokens: { input: 0.4, output: 1.6 },
  ...overrides
})

const gemini = (overrides: Json = {}): Json => ({
  name: 'gemini-2-5-flash-lite',
  provider: 'gemini',
  model: 'gemini-2.5-flash-lite',
  credential_env: 'GEMINI_API_KEY',
  params: ['max_tokens', 'temperature'],
  fixed_params: { reasoning_effort: 'none' },
  price_per_million_tokens: { input: 0.1, output: 0.4 },
  ...overrides
})

const capability = (overrides: Json = {}): Json => ({
  name: 'ticket-classifier',
  type: 'chat',
  description: 'Classifies a support ticket.',
  primary: 'openai-gpt-4-1-mini',
  fallback: 'gemini-2-5-flash-lite',
  timeout_seconds: 10,
  max_retries: 1,
  max_tokens: 256,
  json_mode: true,
  contract: {
    format: 'json',
    fields: [
      {
        name: 'category',
        type: 'string',
        allowed: ['billing', 'technical', 'account', 'other']
      },
      { name: 'reason', type: 'string' }
    ]
  },
  ...overrides
})

const catalog = (overrides: Json = {}): Json => ({
  deployments: [openai(), gemini()],
  capabilities: [capability()],
  ...overrides
})

const serve = (content: unknown): void => {
  const text = typeof content === 'string' ? content : JSON.stringify(content)
  mockedRead.mockReturnValue(text)
}

const problemsFor = (
  content: unknown,
  env: Record<string, string | undefined> = ENV
): string[] => {
  serve(content)
  try {
    assertCatalog(env)
  } catch (error) {
    if (error instanceof CatalogError) {
      return error.problems
    }
    throw error
  }
  return []
}

const without = (item: Json, key: string): Json =>
  Object.fromEntries(Object.entries(item).filter(([name]) => name !== key))

const withCapabilities = (...capabilities: Json[]): Json =>
  catalog({ capabilities })

describe('config/catalog', () => {
  const originalEnv = process.env

  beforeEach(() => {
    jest.clearAllMocks()
  })

  afterEach(() => {
    process.env = originalEnv
  })

  describe('the versioned catalog', () => {
    it('the versioned catalog should be valid', () => {
      mockedRead.mockImplementation(((file: fs.PathOrFileDescriptor) =>
        realFs.readFileSync(file, 'utf8')) as typeof readFileSync)
      const env = {
        OPENAI_API_KEY: ENV.OPENAI_API_KEY,
        GEMINI_API_KEY: ENV.GEMINI_API_KEY
      }

      expect(() => assertCatalog(env)).not.toThrow()

      const versioned = JSON.parse(
        realFs.readFileSync(
          path.resolve(process.cwd(), 'catalog/catalog.json'),
          'utf8'
        )
      ) as { capabilities: Json[] }
      const names = versioned.capabilities.map(item => item.name)
      expect(names).toEqual(expect.arrayContaining(PRD_CAPABILITIES))
    })
  })

  describe('getCatalog', () => {
    // The only test of this file that calls getCatalog, so the cache starts empty.
    it('should read the file from CATALOG_FILE at load time and cache the result', () => {
      process.env = { ...ENV, CATALOG_FILE: 'fixtures/late.json' }
      serve(
        withCapabilities(
          capability({ fallback: undefined, contract: undefined })
        )
      )

      const first = getCatalog()
      const second = getCatalog()

      expect(second).toBe(first)
      expect(mockedRead).toHaveBeenCalledTimes(1)
      expect(mockedRead).toHaveBeenCalledWith(
        path.resolve(process.cwd(), 'fixtures/late.json'),
        'utf8'
      )
      expect(first.capabilities[0]).toMatchObject({
        fallback: null,
        contract: null
      })
      expect(first.deployments[1].param_mappings).toEqual({})
      expect(first.deployments[0].fixed_params).toEqual({})
      expect(Object.isFrozen(first.deployments[0].params)).toBe(true)
    })
  })

  describe('file access', () => {
    it('should read CATALOG_FILE relative to the working directory', () => {
      serve(catalog())

      assertCatalog(ENV)

      expect(mockedRead).toHaveBeenCalledWith(
        path.resolve(process.cwd(), 'catalog/test.json'),
        'utf8'
      )
    })

    it('should fall back to catalog/catalog.json without CATALOG_FILE', () => {
      serve(catalog())

      assertCatalog({
        OPENAI_API_KEY: ENV.OPENAI_API_KEY,
        GEMINI_API_KEY: ENV.GEMINI_API_KEY
      })

      expect(mockedRead).toHaveBeenCalledWith(
        path.resolve(process.cwd(), 'catalog/catalog.json'),
        'utf8'
      )
    })

    it('should read process.env when called without an argument', () => {
      process.env = { ...ENV, GEMINI_API_KEY: '' }
      serve(catalog())

      expect(() => assertCatalog()).toThrow(
        "deployment 'gemini-2-5-flash-lite' references GEMINI_API_KEY"
      )
    })

    it('should report an unreadable file and invalid JSON', () => {
      mockedRead.mockImplementation(() => {
        throw new Error('ENOENT')
      })
      let unreadable: string[] = []
      try {
        assertCatalog(ENV)
      } catch (error) {
        unreadable = (error as CatalogError).problems
      }

      expect(unreadable).toEqual(['cannot read catalog/test.json'])
      expect(problemsFor('{ "deployments": [')).toEqual([
        'catalog/test.json is not valid JSON'
      ])
    })

    it('should prefix every problem in the error message', () => {
      serve(withCapabilities(capability({ fallback: 'gemini-lite' })))

      expect(() => assertCatalog(ENV)).toThrow(
        new CatalogError([
          "capability 'ticket-classifier' points to fallback 'gemini-lite', which does not exist"
        ])
      )
      try {
        assertCatalog(ENV)
      } catch (error) {
        expect((error as Error).message).toBe(
          "Invalid catalog: capability 'ticket-classifier' points to fallback 'gemini-lite', which does not exist"
        )
        expect((error as Error).name).toBe('CatalogError')
      }
    })
  })

  describe('references', () => {
    it('should report a fallback that does not exist, naming capability and deployment', () => {
      expect(
        problemsFor(withCapabilities(capability({ fallback: 'gemini-lite' })))
      ).toEqual([
        "capability 'ticket-classifier' points to fallback 'gemini-lite', which does not exist"
      ])
    })

    it('should report a primary that does not exist', () => {
      expect(
        problemsFor(withCapabilities(capability({ primary: 'gpt-x' })))
      ).toEqual([
        "capability 'ticket-classifier' points to primary 'gpt-x', which does not exist"
      ])
    })

    it('should accept a capability without fallback', () => {
      expect(
        problemsFor(withCapabilities(capability({ fallback: null })))
      ).toEqual([])
      const withoutFallback = without(capability(), 'fallback')
      expect(problemsFor(withCapabilities(withoutFallback))).toEqual([])
    })
  })

  describe('names', () => {
    it.each([
      ['Ticket_Classifier'],
      ['ab'],
      ['a'.repeat(41)],
      ['ticket--classifier'],
      ['-ticket']
    ])(
      'should reject names outside kebab-case or the 3 to 40 range: %s',
      name => {
        expect(problemsFor(withCapabilities(capability({ name })))).toEqual([
          `capabilities[0].name '${name}' must be kebab-case with 3 to 40 characters`
        ])
      }
    )

    it('should accept a name with exactly 40 characters', () => {
      const name = `${'a'.repeat(19)}-${'b'.repeat(20)}`
      expect(problemsFor(withCapabilities(capability({ name })))).toEqual([])
    })

    it.each([['modelo-1'], ['chat-2'], ['ai-model'], ['default-test']])(
      'should reject the generic name %s',
      name => {
        expect(problemsFor(withCapabilities(capability({ name })))).toEqual([
          `capability '${name}' has a generic name; describe its expected use`
        ])
      }
    )

    it.each([
      ['gpt4-helper', 'gpt'],
      ['gemini-classifier', 'gemini'],
      ['ticket-openai', 'openai'],
      ['claude-writer', 'claude']
    ])('should reject the provider name %s', (name, term) => {
      expect(problemsFor(withCapabilities(capability({ name })))).toEqual([
        `capability '${name}' must not name a provider or model family ('${term}')`
      ])
    })

    it('should accept the three capability names of the PRD', () => {
      const capabilities = PRD_CAPABILITIES.map(name => capability({ name }))

      expect(problemsFor(withCapabilities(...capabilities))).toEqual([])
    })

    it('should reject deployment names outside kebab-case or the 3 to 60 range', () => {
      const problems = problemsFor(
        catalog({
          deployments: [openai({ name: 'Openai_Mini' }), gemini()],
          capabilities: [capability({ primary: 'Openai_Mini' })]
        })
      )

      expect(problems).toEqual([
        "deployments[0].name 'Openai_Mini' must be kebab-case with 3 to 60 characters"
      ])
    })

    it('should reject duplicates, fallback equal to primary, mappings outside params and params without max_tokens', () => {
      const problems = problemsFor(
        catalog({
          deployments: [
            openai({ params: ['temperature'] }),
            openai({ name: 'openai-gpt-4-1' }),
            openai({ name: 'openai-gpt-4-1', param_mappings: { top_p: 'x' } }),
            gemini()
          ],
          capabilities: [
            capability(),
            capability({ fallback: 'openai-gpt-4-1-mini' })
          ]
        })
      )

      expect(problems).toEqual([
        "deployment 'openai-gpt-4-1' is declared more than once",
        "deployment 'openai-gpt-4-1-mini' must accept max_tokens",
        "deployment 'openai-gpt-4-1-mini' maps 'max_tokens', which is not in its params",
        "deployment 'openai-gpt-4-1' maps 'top_p', which is not in its params",
        "capability 'ticket-classifier' is declared more than once",
        "capability 'ticket-classifier' uses 'openai-gpt-4-1-mini' as both primary and fallback"
      ])
    })
  })

  describe('ranges and schema', () => {
    it.each([
      ['max_tokens', 0, 'must be greater than or equal to 1'],
      ['max_tokens', 8193, 'must be less than or equal to 8192'],
      ['timeout_seconds', 0, 'must be greater than or equal to 1'],
      ['timeout_seconds', 121, 'must be less than or equal to 120'],
      ['max_retries', 4, 'must be less than or equal to 3'],
      ['max_retries', 1.5, 'must be an integer'],
      ['type', 'embedding', 'must be [chat]'],
      ['json_mode', 'yes', 'must be a boolean']
    ])('should reject capability %s = %p', (field, value, message) => {
      expect(
        problemsFor(withCapabilities(capability({ [field]: value })))
      ).toEqual([`capabilities[0].${field} ${message}`])
    })

    it('should accept the boundaries of every range', () => {
      const problems = problemsFor(
        withCapabilities(
          capability({ max_tokens: 1, timeout_seconds: 1, max_retries: 0 }),
          capability({
            name: 'release-notes-writer',
            max_tokens: 8192,
            timeout_seconds: 120,
            max_retries: 3
          })
        )
      )

      expect(problems).toEqual([])
    })

    it('should reject a negative or too high price', () => {
      const problems = problemsFor(
        catalog({
          deployments: [
            openai({ price_per_million_tokens: { input: -1, output: 1001 } }),
            gemini()
          ]
        })
      )

      expect(problems).toEqual([
        'deployments[0].price_per_million_tokens.input must be greater than or equal to 0',
        'deployments[0].price_per_million_tokens.output must be less than or equal to 1000'
      ])
    })

    it('should reject unknown keys', () => {
      const rest = without(capability(), 'max_tokens')
      const problems = problemsFor(
        withCapabilities({ ...rest, max_token: 256 })
      )

      expect(problems).toEqual([
        'capabilities[0].max_tokens is required',
        'capabilities[0].max_token is not allowed'
      ])
    })

    it('should reject unknown fixed params and invalid reasoning effort', () => {
      const problems = problemsFor(
        catalog({
          deployments: [
            openai({ fixed_params: { seed: 1 } }),
            gemini({ fixed_params: { reasoning_effort: 'max' } })
          ]
        })
      )

      expect(problems).toEqual([
        'deployments[0].fixed_params.seed is not allowed',
        'deployments[1].fixed_params.reasoning_effort must be one of [none, minimal, low, medium, high]'
      ])
    })

    it('should reject params outside the accepted list and repeated params', () => {
      const problems = problemsFor(
        catalog({
          deployments: [
            openai({ params: ['max_tokens', 'stream', 'max_tokens'] }),
            gemini()
          ]
        })
      )

      expect(problems).toEqual([
        'deployments[0].params[1] must be one of [max_tokens, temperature, top_p, stop, response_format]',
        'deployments[0].params[2] contains a duplicate value'
      ])
    })

    it('should reject an unknown provider and an invalid model id', () => {
      const problems = problemsFor(
        catalog({
          deployments: [
            openai({ provider: 'anthropic', model: 'gpt 4' }),
            gemini()
          ]
        })
      )

      expect(problems).toHaveLength(2)
      expect(problems[0]).toBe(
        'deployments[0].provider must be one of [openai, gemini, simulated]'
      )
      expect(problems[1]).toMatch(/^deployments\[0\]\.model /)
    })

    it('should validate the response contract', () => {
      const problems = problemsFor(
        withCapabilities(
          capability({
            contract: {
              format: 'xml',
              fields: [
                { name: 'score', type: 'number', allowed: ['high'] },
                { name: 'score', type: 'boolean', allowed: [true] },
                { name: 'flag', type: 'date' }
              ]
            }
          })
        )
      )

      expect(problems).toEqual([
        'capabilities[0].contract.format must be [json]',
        'capabilities[0].contract.fields[0].allowed[0] must be a number',
        'capabilities[0].contract.fields[2].type must be one of [string, number, boolean]',
        'capabilities[0].contract.fields[1] contains a duplicate value'
      ])
    })

    it('should report a catalog that is not an object', () => {
      expect(problemsFor('null')).toEqual(['catalog must be of type object'])
    })

    it('should report empty and missing lists', () => {
      expect(problemsFor({ deployments: [] })).toEqual([
        'deployments must contain at least 1 items',
        'capabilities is required'
      ])
    })
  })

  describe('credentials', () => {
    it('should reject a missing or empty credential without printing values', () => {
      const missing = problemsFor(catalog(), {
        CATALOG_FILE: ENV.CATALOG_FILE,
        OPENAI_API_KEY: ENV.OPENAI_API_KEY
      })
      const empty = problemsFor(catalog(), { ...ENV, GEMINI_API_KEY: '' })

      const expected = [
        "deployment 'gemini-2-5-flash-lite' references GEMINI_API_KEY, which is missing or empty in the environment"
      ]
      expect(missing).toEqual(expected)
      expect(empty).toEqual(expected)
      expect(missing.join('\n')).not.toContain(ENV.OPENAI_API_KEY)
    })

    it('should not echo the credential_env value when its format is invalid', () => {
      const problems = problemsFor(
        catalog({
          deployments: [openai({ credential_env: 'sk-proj-abc123' }), gemini()]
        })
      )

      expect(problems).toEqual([
        'deployments[0].credential_env must be an environment variable name (uppercase letters, digits and underscore)'
      ])
      expect(problems.join('\n')).not.toContain('sk-proj-abc123')
    })

    it('should allow a simulated deployment without credential', () => {
      const simulated = without(
        openai({
          name: 'simulated-ticket',
          provider: 'simulated',
          model: 'ticket-ok'
        }),
        'credential_env'
      )

      expect(
        problemsFor(
          catalog({
            deployments: [simulated, gemini()],
            capabilities: [capability({ primary: 'simulated-ticket' })]
          })
        )
      ).toEqual([])
    })

    it('should require a credential for openai and gemini', () => {
      const withoutCredential = without(openai(), 'credential_env')

      expect(
        problemsFor(catalog({ deployments: [withoutCredential, gemini()] }))
      ).toEqual(['deployments[0].credential_env is required'])
    })
  })

  describe('malformed items', () => {
    it('should still cross-check items whose name is missing or not a string', () => {
      const nameless = without(
        openai({ credential_env: 'MISSING_KEY' }),
        'name'
      )
      const problems = problemsFor(
        catalog({
          deployments: [nameless, gemini(), 7],
          capabilities: [capability({ name: 3, primary: 'nowhere' })]
        })
      )

      expect(problems).toEqual([
        'deployments[0].name is required',
        'deployments[2] must be of type object',
        'capabilities[0].name must be a string',
        "deployment '?' references MISSING_KEY, which is missing or empty in the environment",
        "capability '?' points to primary 'nowhere', which does not exist"
      ])
    })

    it('should tolerate params and mappings of the wrong type', () => {
      const problems = problemsFor(
        catalog({
          deployments: [
            openai({ params: 'max_tokens', param_mappings: ['x'] }),
            gemini()
          ]
        })
      )

      expect(problems).toEqual([
        'deployments[0].params must be an array',
        'deployments[0].param_mappings must be of type object'
      ])
    })
  })
})
