import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import path from 'node:path'

import { NOOP } from './code.mjs'
import { binPath, chunks, runNode } from './exec.mjs'
import { ROOT, toPosix } from './scope.mjs'

const SELF_TEST = path.join(
  ROOT,
  'scripts',
  '__tests__',
  'design-system-rules.test.mjs'
)
const TEMPLATE_RULES = {
  'no-color-attr-on-buttons': 'error',
  'no-mat-paginator': 'error',
  'require-aria-label-icon-button': 'error'
}

let selfTestPassed

function selfTest(frontendDir) {
  if (selfTestPassed === undefined) {
    const result = spawnSync(process.execPath, ['--test', SELF_TEST], {
      cwd: frontendDir,
      encoding: 'utf8'
    })
    selfTestPassed = result.status === 0
    if (!selfTestPassed) {
      process.stderr.write(result.stdout + result.stderr)
    }
  }
  return selfTestPassed
}

function bannedFiles(target) {
  const banned = target.files.filter(file => file.endsWith('.component.scss'))
  for (const file of banned) {
    console.error(
      `  apps/frontend/${file}: component styles are .component.css, never .component.scss`
    )
  }
  return banned.length === 0
}

function lintCss(target, rulesChanged) {
  const files = rulesChanged
    ? ['src/**/*.css']
    : target.files.filter(
        file => file.startsWith('src/') && file.endsWith('.css')
      )
  if (files.length === 0) {
    return NOOP
  }
  const stylelint = binPath(target.dir, 'stylelint')
  return chunks(files)
    .map(group =>
      runNode(
        stylelint,
        ['--max-warnings', '0', '--allow-empty-input', ...group],
        target.dir
      )
    )
    .every(Boolean)
}

async function lintTemplates(target, rulesChanged) {
  const files = rulesChanged
    ? ['src/**/*.html']
    : target.files.filter(
        file => file.startsWith('src/') && file.endsWith('.html')
      )
  if (files.length === 0) {
    return NOOP
  }
  const requireFromFrontend = createRequire(
    path.join(target.dir, 'package.json')
  )
  const { ESLint } = requireFromFrontend('eslint')
  const eslint = new ESLint({
    cwd: target.dir,
    useEslintrc: false,
    allowInlineConfig: false,
    errorOnUnmatchedPattern: false,
    rulePaths: [path.join(target.dir, 'tools', 'eslint-rules')],
    overrideConfig: {
      root: true,
      parser: requireFromFrontend.resolve('@angular-eslint/template-parser'),
      rules: TEMPLATE_RULES
    }
  })
  const results = await eslint.lintFiles(files)
  let findings = 0
  for (const result of results) {
    for (const message of result.messages) {
      findings += 1
      const file = toPosix(path.relative(ROOT, result.filePath))
      console.error(
        `  ${file}:${message.line}:${message.column} ${message.message}`
      )
    }
  }
  return findings === 0
}

export async function stylesGate(target) {
  const rulesChanged =
    target.configChanged || target.files.some(file => file.startsWith('tools/'))
  const filenamesOk = bannedFiles(target)
  const relevant =
    rulesChanged ||
    target.files.some(file => /^src\/.+\.(css|html)$/.test(file))
  if (!relevant) {
    console.log('  frontend: no changed .css or .html files')
    return filenamesOk ? NOOP : false
  }
  if (!selfTest(target.dir)) {
    console.error('  the design-system rules self-test failed: no verdict')
    return false
  }
  const css = lintCss(target, rulesChanged)
  const templates = await lintTemplates(target, rulesChanged)
  if (!filenamesOk || css === false || templates === false) {
    return false
  }
  return css === NOOP && templates === NOOP ? NOOP : true
}
