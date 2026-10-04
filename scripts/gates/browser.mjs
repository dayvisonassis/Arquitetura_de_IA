import { createRequire } from 'node:module'
import path from 'node:path'

import { NOOP, SKIPPED } from './code.mjs'
import { banner, binPath, runNode } from './exec.mjs'
import { ROOT } from './scope.mjs'

const { API_URL, BASE_URL } = createRequire(path.join(ROOT, 'package.json'))(
  './tests/e2e/sessions.js'
)

const SHARED_HARNESS = new Set([
  'tests/e2e/sessions.js',
  'tests/e2e/global-setup.js'
])

async function reachable(url) {
  try {
    await fetch(url, { signal: AbortSignal.timeout(3000) })
    return true
  } catch {
    return false
  }
}

export async function browserGate(
  scope,
  { name, config, inScope, scopeText, skipVar, forceVar, unverified }
) {
  if (process.env[skipVar] === '1') {
    banner([`${skipVar}=1: the ${name} gate did NOT run.`, unverified])
    return SKIPPED
  }
  const touched = scope.files.some(
    file => inScope(file) || SHARED_HARNESS.has(file) || file === config
  )
  if (!touched && process.env[forceVar] !== '1') {
    console.log(`  no changed ${scopeText} files (${forceVar}=1 runs anyway)`)
    return NOOP
  }
  const down = []
  for (const url of [BASE_URL, API_URL]) {
    if (!(await reachable(url))) {
      down.push(url)
    }
  }
  if (down.length > 0) {
    console.error(
      [
        `  not reachable: ${down.join(', ')}`,
        `  The ${name} gate needs the app running. Start it with ./dev.sh and run the gate again.`
      ].join('\n')
    )
    return false
  }
  return runNode(
    binPath(ROOT, '@playwright/test', 'playwright'),
    ['test', '--config', config],
    ROOT
  )
}
