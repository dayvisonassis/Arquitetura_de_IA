import { createRequire } from 'node:module'
import path from 'node:path'

import { NOOP } from './code.mjs'
import { binPath, runNode } from './exec.mjs'
import { ROOT } from './scope.mjs'

export const SKIPPED = 'skipped'

const { API_URL, BASE_URL } = createRequire(path.join(ROOT, 'package.json'))(
  './tests/e2e/sessions.js'
)

const inE2eScope = file =>
  file.startsWith('apps/frontend/') ||
  file.startsWith('apps/backend/') ||
  file.startsWith('tests/e2e/') ||
  file === 'playwright.e2e.config.js'

async function reachable(url) {
  try {
    await fetch(url, { signal: AbortSignal.timeout(3000) })
    return true
  } catch {
    return false
  }
}

function banner(lines) {
  const width = Math.max(...lines.map(line => line.length)) + 4
  const border = '!'.repeat(width)
  console.warn(
    [
      border,
      ...lines.map(line => `! ${line.padEnd(width - 4)} !`),
      border
    ].join('\n')
  )
}

export async function e2eGate(scope) {
  if (process.env.E2E_SKIP === '1') {
    banner([
      'E2E_SKIP=1: the e2e-frontend gate did NOT run.',
      'No user flow was verified in a browser.'
    ])
    return SKIPPED
  }
  if (!scope.files.some(inE2eScope) && process.env.E2E_FORCE !== '1') {
    console.log(
      '  no changed frontend, backend or e2e files (E2E_FORCE=1 runs anyway)'
    )
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
        '  The e2e gate needs the app running. Start it and run the gate again:',
        '    cd apps/frontend && npm start',
        '    cd apps/backend && npm run dev',
        '  (from F01 on, ./dev.sh starts everything)'
      ].join('\n')
    )
    return false
  }
  return runNode(
    binPath(ROOT, '@playwright/test', 'playwright'),
    ['test', '--config', 'playwright.e2e.config.js'],
    ROOT
  )
}
