import { spawnSync } from 'child_process'
import path from 'path'

const APP_DIR = path.resolve(__dirname, '..', '..')
const FIXTURES = path.join('__tests__', 'fixtures', 'catalog')
// The child must exit on its own well before this deadline.
const DEADLINE_MS = 20000

// Runs the real entry point, with the local .env.testing and a catalog fixture.
const start = (fixture: string) =>
  spawnSync(
    process.execPath,
    ['-r', 'ts-node/register/transpile-only', 'index.ts'],
    {
      cwd: APP_DIR,
      env: {
        ...process.env,
        NODE_ENV: 'testing',
        CATALOG_FILE: path.join(FIXTURES, fixture)
      },
      encoding: 'utf8',
      timeout: DEADLINE_MS
    }
  )

const catalogLines = (stderr: string): string[] =>
  stderr.split(/\r?\n/).filter(line => line.startsWith('Invalid catalog: '))

describe('Proxy startup with an invalid catalog', () => {
  it.each([
    [
      'fallback-missing.json',
      "Invalid catalog: capability 'ticket-classifier' points to fallback 'gemini-lite', which does not exist"
    ],
    [
      'invalid-name.json',
      "Invalid catalog: capabilities[0].name 'Ticket_Classifier' must be kebab-case with 3 to 40 characters"
    ],
    [
      'max-tokens-too-high.json',
      'Invalid catalog: capabilities[0].max_tokens must be less than or equal to 8192'
    ]
  ])(
    'should refuse to start with an invalid catalog: %s',
    (fixture, line) => {
      const result = start(fixture)

      expect(result.error).toBeUndefined()
      expect(result.status).toBe(1)
      expect(catalogLines(result.stderr)).toEqual([line])
    },
    DEADLINE_MS + 5000
  )

  it(
    'should report every problem of the catalog on its own line',
    () => {
      const result = start('several-problems.json')

      expect(result.error).toBeUndefined()
      expect(result.status).toBe(1)
      expect(catalogLines(result.stderr)).toHaveLength(3)
    },
    DEADLINE_MS + 5000
  )
})
