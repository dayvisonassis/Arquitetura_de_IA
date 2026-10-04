import { browserGate } from './browser.mjs'

const inE2eScope = file =>
  file.startsWith('apps/frontend/') ||
  file.startsWith('apps/backend/') ||
  file.startsWith('tests/e2e/')

export function e2eGate(scope) {
  return browserGate(scope, {
    name: 'e2e-frontend',
    config: 'playwright.e2e.config.js',
    inScope: inE2eScope,
    scopeText: 'frontend, backend or e2e',
    skipVar: 'E2E_SKIP',
    forceVar: 'E2E_FORCE',
    unverified: 'No user flow was verified in a browser.'
  })
}
