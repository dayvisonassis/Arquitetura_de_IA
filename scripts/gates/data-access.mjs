import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'

import { NOOP } from './code.mjs'
import { ROOT, toPosix } from './scope.mjs'

const ALLOWLIST_KEY = {
  'no-knex-raw': 'rawSql',
  'no-query-in-loop': 'queryInLoop'
}
const SELF_TEST = path.join(
  ROOT,
  'scripts',
  '__tests__',
  'data-access-rules.test.mjs'
)

let selfTestPassed

function selfTest(backendDir) {
  if (selfTestPassed === undefined) {
    const result = spawnSync(process.execPath, ['--test', SELF_TEST], {
      cwd: backendDir,
      encoding: 'utf8'
    })
    selfTestPassed = result.status === 0
    if (!selfTestPassed) {
      process.stderr.write(result.stdout + result.stderr)
    }
  }
  return selfTestPassed
}

function entryProblems(key, entry) {
  const problems = []
  if (typeof entry.file !== 'string') {
    problems.push('"file" is missing')
  }
  if (key === 'rawSql' && typeof entry.sql !== 'string') {
    problems.push('"sql" is missing')
  }
  if (key === 'queryInLoop') {
    if (typeof entry.query !== 'string') {
      problems.push('"query" is missing')
    }
    if (!entry.function || entry.function === '<anonymous>') {
      problems.push('"function" must name a function')
    }
  }
  if (typeof entry.reason !== 'string' || entry.reason.trim().length < 10) {
    problems.push('"reason" needs at least 10 characters')
  }
  if (!entry.feature) {
    problems.push('"feature" is missing')
  }
  return problems
}

function loadAllowlist(backendDir, key) {
  const file = path.join(backendDir, 'tools', 'data-access-allowlist.json')
  const entries = JSON.parse(readFileSync(file, 'utf8'))[key] ?? []
  return entries.map(entry => ({ entry, problems: entryProblems(key, entry) }))
}

function describeEntry(entry) {
  const target = entry.sql ?? `${entry.function}: ${entry.query}`
  return `${entry.file} [${entry.feature ?? 'no feature'}] ${target}`
}

function printAllowlist(checked) {
  const invalid = checked.filter(item => item.problems.length > 0)
  const valid = checked.filter(item => item.problems.length === 0)
  const pending = valid.filter(item => !item.entry.approved)
  const approved = valid.filter(item => item.entry.approved)
  for (const { entry, problems } of invalid) {
    console.error(
      `  IGNORED allowlist entry (${problems.join('; ')}): ${describeEntry(entry)}`
    )
  }
  if (pending.length > 0) {
    console.log('  NEEDS HUMAN APPROVAL before merge:')
    pending.forEach(({ entry }) => console.log(`    ${describeEntry(entry)}`))
  }
  if (approved.length > 0) {
    console.log('  approved:')
    approved.forEach(({ entry }) =>
      console.log(`    ${describeEntry(entry)} — ${entry.approved}`)
    )
  }
  return valid.map(item => item.entry)
}

function targetFiles(target) {
  const gateFilesChanged = target.files.some(file => file.startsWith('tools/'))
  if (gateFilesChanged) {
    return ['src']
  }
  return target.files.filter(
    file => file.startsWith('src/') && file.endsWith('.js')
  )
}

export async function dataAccessGate(target, rule) {
  const files = targetFiles(target)
  if (files.length === 0) {
    console.log('  backend: no changed files under src/')
    return NOOP
  }
  if (!selfTest(target.dir)) {
    console.error('  the rules self-test failed: no verdict')
    return false
  }
  const key = ALLOWLIST_KEY[rule]
  const allowlist = printAllowlist(loadAllowlist(target.dir, key))
  const { ESLint } = createRequire(path.join(target.dir, 'package.json'))(
    'eslint'
  )
  const eslint = new ESLint({
    cwd: target.dir,
    useEslintrc: false,
    allowInlineConfig: false,
    errorOnUnmatchedPattern: false,
    rulePaths: [path.join(target.dir, 'tools', 'eslint-rules')],
    overrideConfig: {
      root: true,
      env: { node: true, es2022: true },
      parserOptions: { ecmaVersion: 2022, sourceType: 'module' },
      rules: { [rule]: ['error', { allowlist }] }
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
  console.log(`  ${rule}: ${findings} finding(s) in ${results.length} file(s)`)
  return findings === 0
}
