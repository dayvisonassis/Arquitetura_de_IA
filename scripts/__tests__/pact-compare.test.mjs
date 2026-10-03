// Self-test of the semantic pact comparison behind tests-backend. runGate runs it
// before comparing the generated pact with the committed one.
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, it } from 'node:test'

import { comparePacts } from '../gates/contracts.mjs'

const CONSUMER = 'ai-gateway-backend'
const FILE = 'ai-gateway-backend-ai-gateway-ia.json'

const interaction = (description, code = 'invalid_admin_key') => ({
  description,
  request: { method: 'GET', path: '/admin/domains' },
  response: { status: 401, body: { error: { code } } }
})

const pact = (interactions, extra = {}) => ({
  consumer: { name: CONSUMER },
  provider: { name: 'ai-gateway-ia' },
  interactions,
  metadata: { pactSpecification: { version: '3.0.0' } },
  ...extra
})

const dirs = []

function dirWith(files) {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'pact-compare-'))
  dirs.push(dir)
  for (const [name, content] of Object.entries(files)) {
    writeFileSync(path.join(dir, name), JSON.stringify(content))
  }
  return dir
}

afterEach(() => {
  while (dirs.length > 0) {
    rmSync(dirs.pop(), { recursive: true, force: true })
  }
})

describe('comparePacts', () => {
  it('accepts the same interactions in another order and with other metadata', () => {
    const generated = dirWith({
      [FILE]: pact([interaction('a'), interaction('b')])
    })
    const committed = dirWith({
      [FILE]: pact([interaction('b'), interaction('a')], {
        metadata: { pactJs: { version: 'other' } }
      })
    })
    assert.deepEqual(comparePacts(generated, committed, CONSUMER), [])
  })

  it('reports a changed interaction', () => {
    const generated = dirWith({
      [FILE]: pact([interaction('a', 'other_code')])
    })
    const committed = dirWith({ [FILE]: pact([interaction('a')]) })
    assert.match(comparePacts(generated, committed, CONSUMER)[0], /differs/)
  })

  it('reports added and removed interactions', () => {
    const generated = dirWith({ [FILE]: pact([interaction('new')]) })
    const committed = dirWith({ [FILE]: pact([interaction('old')]) })
    const problems = comparePacts(generated, committed, CONSUMER)
    assert.equal(problems.length, 2)
    assert.match(problems.join('\n'), /"new" is not committed/)
    assert.match(problems.join('\n'), /"old" is no longer generated/)
  })

  it('reports a pact that was generated but not committed, and the reverse', () => {
    const generated = dirWith({ [FILE]: pact([interaction('a')]) })
    const committed = dirWith({
      'ai-gateway-backend-other.json': pact([interaction('a')])
    })
    const problems = comparePacts(generated, committed, CONSUMER)
    assert.match(problems.join('\n'), /generated but not committed/)
    assert.match(problems.join('\n'), /committed but no longer generated/)
  })

  it('ignores pacts of another consumer', () => {
    const generated = dirWith({ [FILE]: pact([interaction('a')]) })
    const committed = dirWith({
      [FILE]: pact([interaction('a')]),
      'other-consumer.json': { ...pact([]), consumer: { name: 'other' } }
    })
    assert.deepEqual(comparePacts(generated, committed, CONSUMER), [])
  })
})
