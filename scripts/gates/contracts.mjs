import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync
} from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { NOOP } from './code.mjs'
import { hasNpmScript, runNpmScript, runSelfTest } from './exec.mjs'
import { appScope, BACKEND, ROOT } from './scope.mjs'

export const BACKEND_CONSUMER = 'ai-gateway-backend'

const PACTS_DIR = path.join(ROOT, 'contracts', 'pacts')
const SELF_TEST = path.join(
  ROOT,
  'scripts',
  '__tests__',
  'pact-compare.test.mjs'
)
const COMPARED_FIELDS = [
  'providerStates',
  'providerState',
  'request',
  'response'
]

let selfTestPassed

function canonical(value) {
  if (Array.isArray(value)) {
    return value.map(canonical)
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map(key => [key, canonical(value[key])])
    )
  }
  return value
}

function interactionBody(interaction) {
  return JSON.stringify(
    canonical(
      Object.fromEntries(
        COMPARED_FIELDS.filter(field => field in interaction).map(field => [
          field,
          interaction[field]
        ])
      )
    )
  )
}

function readPacts(dir, consumer) {
  if (!existsSync(dir)) {
    return new Map()
  }
  return new Map(
    readdirSync(dir)
      .filter(name => name.endsWith('.json'))
      .map(name => [
        name,
        JSON.parse(readFileSync(path.join(dir, name), 'utf8'))
      ])
      .filter(([, pact]) => pact.consumer?.name === consumer)
  )
}

function interactionsByDescription(file, pact, problems) {
  const byDescription = new Map()
  for (const interaction of pact.interactions ?? []) {
    if (byDescription.has(interaction.description)) {
      problems.push(
        `${file}: duplicated interaction "${interaction.description}"`
      )
    }
    byDescription.set(interaction.description, interactionBody(interaction))
  }
  return byDescription
}

function comparePact(file, generated, versioned, problems) {
  if (generated.provider?.name !== versioned.provider?.name) {
    problems.push(
      `${file}: provider "${versioned.provider?.name}" committed, "${generated.provider?.name}" generated`
    )
  }
  const expected = interactionsByDescription(file, generated, problems)
  const committed = interactionsByDescription(file, versioned, problems)
  for (const [description, body] of expected) {
    if (!committed.has(description)) {
      problems.push(`${file}: interaction "${description}" is not committed`)
    } else if (committed.get(description) !== body) {
      problems.push(
        `${file}: interaction "${description}" differs from the committed one`
      )
    }
  }
  for (const description of committed.keys()) {
    if (!expected.has(description)) {
      problems.push(
        `${file}: committed interaction "${description}" is no longer generated`
      )
    }
  }
}

export function comparePacts(generatedDir, versionedDir, consumer) {
  const problems = []
  const generated = readPacts(generatedDir, consumer)
  const versioned = readPacts(versionedDir, consumer)
  for (const [file, pact] of generated) {
    if (versioned.has(file)) {
      comparePact(file, pact, versioned.get(file), problems)
    } else {
      problems.push(`${file}: generated but not committed`)
    }
  }
  for (const file of versioned.keys()) {
    if (!generated.has(file)) {
      problems.push(`${file}: committed but no longer generated`)
    }
  }
  return problems
}

function runContracts(target) {
  const temp = mkdtempSync(path.join(os.tmpdir(), 'pacts-'))
  try {
    if (!runNpmScript(target.dir, 'test:contracts', { PACT_DIR: temp })) {
      return false
    }
    const problems = comparePacts(temp, PACTS_DIR, BACKEND_CONSUMER)
    for (const problem of problems) {
      console.error(`  contracts/pacts/${problem}`)
    }
    if (problems.length > 0) {
      console.error(
        '  Regenerate with "cd apps/backend && npm run test:contracts" and commit contracts/pacts/.'
      )
    }
    return problems.length === 0
  } finally {
    rmSync(temp, { recursive: true, force: true })
  }
}

export function backendContractsGate(scope) {
  const target = appScope(scope, BACKEND)
  const pactsTouched = scope.files.some(file =>
    file.startsWith('contracts/pacts/')
  )
  if (!target.touched && !pactsTouched) {
    console.log('  contracts: no changed backend or pact files')
    return NOOP
  }
  const hasTests = existsSync(path.join(target.dir, '__tests__', 'contracts'))
  const committed = readPacts(PACTS_DIR, BACKEND_CONSUMER)
  if (!hasTests) {
    if (committed.size > 0) {
      console.error(
        '  contracts/pacts/ has backend pacts but apps/backend/__tests__/contracts does not exist'
      )
      return false
    }
    console.log('  contracts: apps/backend has no __tests__/contracts')
    return NOOP
  }
  if (!hasNpmScript(target.dir, 'test:contracts')) {
    console.error(
      '  apps/backend has __tests__/contracts but no "test:contracts" script'
    )
    return false
  }
  if (selfTestPassed === undefined) {
    selfTestPassed = runSelfTest(SELF_TEST, ROOT)
  }
  if (!selfTestPassed) {
    console.error('  the pact comparison self-test failed: no verdict')
    return false
  }
  return runContracts(target)
}
