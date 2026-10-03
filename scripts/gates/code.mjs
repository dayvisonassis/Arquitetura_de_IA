import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'

import picomatch from 'picomatch'

import { checkArchitecture } from '../check-architecture.mjs'
import {
  allPass,
  binPath,
  captureNode,
  chunks,
  runNode,
  runNpmScript
} from './exec.mjs'
import { appScope, ROOT } from './scope.mjs'

export const NOOP = 'noop'

const SCRIPT_FILE = /\.[cm]?[jt]s$/
const COMPONENT_ASSET = /\.component\.(html|css)$/

const ARCH_TS_CONFIG = {
  frontend: 'tsconfig.json',
  ia: 'tsconfig.eslint.json',
  ia_simulator: 'tsconfig.eslint.json'
}

const note = message => console.log(`  ${message}`)

export function combine(results) {
  if (results.includes(false)) {
    return false
  }
  return results.every(result => result === NOOP) ? NOOP : true
}

export async function forApps(scope, apps, check) {
  const results = []
  for (const app of apps) {
    const target = appScope(scope, app)
    if (!target.touched) {
      note(`${app}: no changed files`)
      results.push(NOOP)
    } else {
      results.push(await check(target))
    }
  }
  return combine(results)
}

export function typecheck(target, project) {
  return runNode(
    binPath(target.dir, 'typescript', 'tsc'),
    ['--noEmit', '-p', project],
    target.dir
  )
}

export function lint(target, { extensions, under = '' }) {
  const targets = target.configChanged
    ? [under || '.']
    : target.files.filter(
        file =>
          file.startsWith(under) &&
          extensions.some(extension => file.endsWith(extension))
      )
  if (targets.length === 0) {
    note(`${target.app}: no changed ${extensions.join('/')} files`)
    return NOOP
  }
  const eslint = binPath(target.dir, 'eslint')
  const args = [
    '--max-warnings',
    '0',
    '--no-error-on-unmatched-pattern',
    '--ext',
    extensions.join(',')
  ]
  return allPass(
    chunks(targets).map(group =>
      runNode(eslint, [...args, ...group], target.dir)
    )
  )
}

function coverageMatcher(patterns) {
  const included = patterns.filter(pattern => !pattern.startsWith('!'))
  const excluded = patterns
    .filter(pattern => pattern.startsWith('!'))
    .map(pattern => pattern.slice(1))
  const isIncluded = picomatch(included.length > 0 ? included : ['**'])
  const isExcluded = excluded.length > 0 ? picomatch(excluded) : () => false
  return file => isIncluded(file) && !isExcluded(file)
}

function relatedFiles(target) {
  const files = target.files.map(file =>
    COMPONENT_ASSET.test(file) ? file.replace(/\.(html|css)$/, '.ts') : file
  )
  return [...new Set(files)].filter(
    file => SCRIPT_FILE.test(file) && existsSync(path.join(target.dir, file))
  )
}

export function tests(target) {
  const jest = binPath(target.dir, 'jest')
  if (target.configChanged) {
    note(`${target.app}: test configuration changed, running the whole suite`)
    return runNode(jest, ['--ci', '--coverage'], target.dir)
  }
  const related = relatedFiles(target)
  if (related.length === 0) {
    note(`${target.app}: no changed source or test files`)
    return NOOP
  }
  const config = createRequire(path.join(target.dir, 'package.json'))(
    './jest.config.js'
  )
  const coverable = related.filter(
    coverageMatcher(config.collectCoverageFrom ?? [])
  )
  const listed = captureNode(
    jest,
    ['--listTests', '--findRelatedTests', ...related],
    target.dir
  )
  if (!listed.ok) {
    process.stderr.write(listed.stderr)
    return false
  }
  const testFiles = listed.stdout
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
  if (testFiles.length === 0) {
    if (coverable.length > 0) {
      console.error(
        `  ${target.app}: changed source with no related test:\n${coverable
          .map(file => `    ${file}`)
          .join('\n')}`
      )
      return false
    }
    note(`${target.app}: no tests related to the changed files`)
    return NOOP
  }
  const args = ['--ci', '--findRelatedTests', ...related]
  if (coverable.length > 0) {
    args.push(
      '--coverage',
      ...coverable.flatMap(file => ['--collectCoverageFrom', file])
    )
  }
  return runNode(jest, args, target.dir)
}

export function buildWithNpm(target) {
  return runNpmScript(target.dir, 'build')
}

export function buildWithTsc(target) {
  return runNode(
    binPath(target.dir, 'typescript', 'tsc'),
    ['-p', 'tsconfig.json'],
    target.dir
  )
}

export function buildAngular(target) {
  return runNode(
    binPath(target.dir, '@angular/cli', 'ng'),
    ['build'],
    target.dir,
    { NG_CLI_ANALYTICS: 'false', CI: 'true' }
  )
}

export function deadcode(target) {
  return runNode(
    binPath(ROOT, 'knip'),
    ['--directory', target.dir, '--no-progress'],
    ROOT
  )
}

export function arch(target) {
  const args = ['--config', '.dependency-cruiser.cjs', '--output-type', 'err']
  if (ARCH_TS_CONFIG[target.app]) {
    args.push('--ts-config', path.join(target.dir, ARCH_TS_CONFIG[target.app]))
  }
  args.push(`apps/${target.app}`)
  const cruised = runNode(
    binPath(ROOT, 'dependency-cruiser', 'depcruise'),
    args,
    ROOT
  )
  const violations = checkArchitecture([target.app])
  for (const violation of violations) {
    console.error(
      `  ${violation.rule}: ${violation.file}:${violation.line} ${violation.message}`
    )
  }
  return cruised && violations.length === 0
}
