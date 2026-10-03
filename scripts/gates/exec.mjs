import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

import { GateError, ROOT, toPosix } from './scope.mjs'

const MAX_ARGS_LENGTH = 24000

export function binPath(baseDir, pkg, bin = pkg) {
  const manifest = path.join(baseDir, 'node_modules', pkg, 'package.json')
  if (!existsSync(manifest)) {
    const where = toPosix(path.relative(ROOT, baseDir)) || 'the repository root'
    throw new GateError(
      `${pkg} is not installed in ${where}: run "npm ci" there first`
    )
  }
  const { bin: bins } = JSON.parse(readFileSync(manifest, 'utf8'))
  const relativeBin = typeof bins === 'string' ? bins : bins?.[bin]
  if (!relativeBin) {
    throw new GateError(`${pkg} does not ship a "${bin}" binary`)
  }
  return path.join(baseDir, 'node_modules', pkg, relativeBin)
}

export function runNode(script, args, cwd, env = {}) {
  const result = spawnSync(process.execPath, [script, ...args], {
    cwd,
    stdio: 'inherit',
    env: { ...process.env, ...env }
  })
  return result.status === 0
}

export function captureNode(script, args, cwd) {
  const result = spawnSync(process.execPath, [script, ...args], {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  })
  return {
    ok: result.status === 0,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? ''
  }
}

export function runNpmScript(cwd, script, env = {}) {
  const result = spawnSync('npm', ['run', script], {
    cwd,
    stdio: 'inherit',
    shell: true,
    env: { ...process.env, ...env }
  })
  return result.status === 0
}

export function hasNpmScript(dir, script) {
  const manifest = JSON.parse(
    readFileSync(path.join(dir, 'package.json'), 'utf8')
  )
  return Boolean(manifest.scripts?.[script])
}

export function runSelfTest(testFile, cwd) {
  const result = spawnSync(process.execPath, ['--test', testFile], {
    cwd,
    encoding: 'utf8'
  })
  if (result.status !== 0) {
    process.stderr.write(result.stdout + result.stderr)
  }
  return result.status === 0
}

export function banner(lines) {
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

export function chunks(items) {
  const groups = [[]]
  let length = 0
  for (const item of items) {
    if (length + item.length + 1 > MAX_ARGS_LENGTH && groups.at(-1).length) {
      groups.push([])
      length = 0
    }
    groups.at(-1).push(item)
    length += item.length + 1
  }
  return groups.filter(group => group.length > 0)
}

export function allPass(results) {
  return results.every(Boolean)
}
