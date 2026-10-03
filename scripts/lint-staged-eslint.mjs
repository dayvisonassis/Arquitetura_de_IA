import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'

const [app, ...files] = process.argv.slice(2)

if (!app || files.length === 0) {
  process.exit(0)
}

const appDir = path.resolve('apps', app)
const eslintBin = path.join(
  appDir,
  'node_modules',
  'eslint',
  'bin',
  'eslint.js'
)

if (!existsSync(eslintBin)) {
  console.error(
    `ESLint is not installed in apps/${app}: run "npm ci" there first.`
  )
  process.exit(1)
}

const relativeFiles = files.map(file =>
  path.relative(appDir, path.resolve(file))
)

try {
  execFileSync(
    process.execPath,
    [eslintBin, '--fix', '--no-error-on-unmatched-pattern', ...relativeFiles],
    { cwd: appDir, stdio: 'inherit' }
  )
} catch (error) {
  process.exit(error.status ?? 1)
}
