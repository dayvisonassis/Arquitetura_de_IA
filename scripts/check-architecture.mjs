import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const APPS = ['frontend', 'backend', 'ia', 'ia_simulator']
const SERVER_APPS = new Set(['backend', 'ia', 'ia_simulator'])
const SKIPPED_DIRS = new Set([
  'node_modules',
  'dist',
  'coverage',
  '__tests__',
  'tests',
  'tools'
])
const SOURCE_FILE = /\.[cm]?[jt]s$/
const CONFIG_FILE = /(^|\/)[^/]+\.config\.[cm]?js$/
const ENV_ACCESS = /\bprocess\s*(\.\s*env\b|\[\s*['"`]env['"`]\s*\])/
const LISTEN_CALL = /\.listen\s*\(/
const ENTRY_FILE = /^index\.[jt]s$/
const ENV_FILES = [/^index\.[jt]s$/, /^loader\.[jt]s$/, /^src\/config\//]

function sourceFiles(dir, relative = '') {
  return readdirSync(path.join(dir, relative), { withFileTypes: true }).flatMap(
    entry => {
      const child = relative ? `${relative}/${entry.name}` : entry.name
      if (entry.isDirectory()) {
        return SKIPPED_DIRS.has(entry.name) || entry.name.startsWith('.')
          ? []
          : sourceFiles(dir, child)
      }
      return SOURCE_FILE.test(entry.name) && !CONFIG_FILE.test(child)
        ? [child]
        : []
    }
  )
}

function withoutComments(code) {
  return code
    .replace(/\/\*[\s\S]*?\*\//g, block => block.replace(/[^\n]/g, ''))
    .replace(/(^|\s)\/\/.*$/gm, '$1')
}

function fileViolations(app, file) {
  const source = readFileSync(path.join(ROOT, 'apps', app, file), 'utf8')
  const isServer = SERVER_APPS.has(app)
  const envAllowed = isServer && ENV_FILES.some(pattern => pattern.test(file))
  return withoutComments(source)
    .split('\n')
    .flatMap((text, index) => {
      const at = { file: `apps/${app}/${file}`, line: index + 1 }
      const found = []
      if (ENV_ACCESS.test(text) && !envAllowed) {
        found.push({
          ...at,
          rule: 'env-only-in-config',
          message: isServer
            ? 'process.env is read only in index, loader or src/config/'
            : 'the frontend never reads process.env'
        })
      }
      if (isServer && LISTEN_CALL.test(text) && !ENTRY_FILE.test(file)) {
        found.push({
          ...at,
          rule: 'listen-only-in-index',
          message: 'only index opens the port, so the app stays testable'
        })
      }
      return found
    })
}

export function checkArchitecture(apps = APPS) {
  return apps.flatMap(app =>
    sourceFiles(path.join(ROOT, 'apps', app)).flatMap(file =>
      fileViolations(app, file)
    )
  )
}

if (path.resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  const requested = process.argv.slice(2)
  const violations = checkArchitecture(requested.length ? requested : APPS)
  for (const violation of violations) {
    console.error(
      `${violation.rule}: ${violation.file}:${violation.line} ${violation.message}`
    )
  }
  process.exit(violations.length === 0 ? 0 : 1)
}
