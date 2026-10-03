import { execFileSync } from 'node:child_process'
import { existsSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..'
)
export const FRONTEND = 'frontend'
export const BACKEND = 'backend'
export const MONOREPO_APPS = ['ia', 'ia_simulator']
export const APPS = [FRONTEND, BACKEND, ...MONOREPO_APPS]

const BASE_CANDIDATES = ['origin/main', 'main']

const APP_CONFIG_FILES = new Set([
  '.eslintrc.json',
  '.npmrc',
  '.stylelintrc.json',
  'angular.json',
  'babel.config.js',
  'jest.config.js',
  'knip.json',
  'package-lock.json',
  'package.json',
  'src/tsconfig.app.json',
  'src/tsconfig.spec.json',
  'tsconfig.eslint.json',
  'tsconfig.gate.json',
  'tsconfig.json'
])

export class GateError extends Error {}

export const toPosix = file => file.split(path.sep).join('/')

const listOf = output =>
  output
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)

export function git(args) {
  return execFileSync('git', ['-c', 'core.quotepath=off', ...args], {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  })
}

function isCommit(ref) {
  try {
    git(['rev-parse', '--verify', '--quiet', `${ref}^{commit}`])
    return true
  } catch {
    return false
  }
}

function resolveBase() {
  const requested = process.env.GATE_BASE
  if (requested) {
    if (!isCommit(requested)) {
      throw new GateError(`GATE_BASE "${requested}" is not a commit`)
    }
    return {
      ref: requested,
      mergeBase: git(['merge-base', 'HEAD', requested]).trim()
    }
  }
  const currentBranch = git(['rev-parse', '--abbrev-ref', 'HEAD']).trim()
  const candidates = BASE_CANDIDATES.filter(
    ref => ref !== currentBranch && isCommit(ref)
  ).map(ref => {
    const mergeBase = git(['merge-base', 'HEAD', ref]).trim()
    const distance = Number(
      git(['rev-list', '--count', `${mergeBase}..HEAD`]).trim()
    )
    return { ref, mergeBase, distance }
  })
  if (candidates.length === 0) {
    return { ref: 'HEAD', mergeBase: git(['rev-parse', 'HEAD']).trim() }
  }
  return candidates.sort((a, b) => a.distance - b.distance)[0]
}

function changedFiles(mergeBase) {
  const commands = [
    ['diff', '--name-only', mergeBase, 'HEAD'],
    ['diff', '--name-only', '--cached'],
    ['diff', '--name-only'],
    ['ls-files', '--others', '--exclude-standard']
  ]
  return [...new Set(commands.flatMap(args => listOf(git(args))))].sort()
}

function expandPaths(inputs) {
  const files = inputs.flatMap(input => {
    const absolute = path.resolve(process.cwd(), input)
    if (!existsSync(absolute)) {
      throw new GateError(`path not found: ${input}`)
    }
    const relative = toPosix(path.relative(ROOT, absolute))
    if (relative.startsWith('..')) {
      throw new GateError(`path outside the repository: ${input}`)
    }
    if (!statSync(absolute).isDirectory()) {
      return [relative]
    }
    return listOf(
      git([
        'ls-files',
        '--cached',
        '--others',
        '--exclude-standard',
        '--',
        relative || '.'
      ])
    )
  })
  return [...new Set(files)].sort()
}

export function createScope(explicitPaths) {
  if (explicitPaths.length > 0) {
    const files = expandPaths(explicitPaths)
    return {
      files,
      description: `explicit paths: ${files.length} file(s)`
    }
  }
  const base = resolveBase()
  const files = changedFiles(base.mergeBase)
  return {
    files,
    description: `base ${base.ref} (merge-base ${base.mergeBase.slice(0, 9)}): ${files.length} changed file(s)`
  }
}

export function appScope(scope, app) {
  const prefix = `apps/${app}/`
  const dir = path.join(ROOT, 'apps', app)
  const touched = scope.files
    .filter(file => file.startsWith(prefix))
    .map(file => file.slice(prefix.length))
  return {
    app,
    dir,
    touched: touched.length > 0,
    configChanged: touched.some(file => APP_CONFIG_FILES.has(file)),
    files: touched.filter(file => existsSync(path.join(dir, file)))
  }
}

export function rootFilesTouched(scope, matcher) {
  return scope.files.some(matcher)
}
