import { browserGate } from './browser.mjs'

const inVisualScope = file =>
  file.startsWith('apps/frontend/') || file.startsWith('tests/visual/')

export function visualGate(scope) {
  return browserGate(scope, {
    name: 'visual-frontend',
    config: 'playwright.visual.config.js',
    inScope: inVisualScope,
    scopeText: 'frontend or visual',
    skipVar: 'VISUAL_SKIP',
    forceVar: 'VISUAL_FORCE',
    unverified:
      'No rendered value (height, font, contrast, theme) was measured.'
  })
}
