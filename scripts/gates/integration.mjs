import { existsSync, readFileSync } from 'node:fs'
import net from 'node:net'
import path from 'node:path'

import { NOOP, SKIPPED } from './code.mjs'
import { banner, hasNpmScript, runNpmScript } from './exec.mjs'
import { appScope } from './scope.mjs'

const PARTS = [
  { dir: 'integration', script: 'test:integration' },
  { dir: 'contracts', script: 'test:contracts' }
]

function readEnvFile(file) {
  return Object.fromEntries(
    readFileSync(file, 'utf8')
      .split('\n')
      .map(line => line.trim())
      .filter(line => line && !line.startsWith('#') && line.includes('='))
      .map(line => {
        const index = line.indexOf('=')
        return [line.slice(0, index).trim(), line.slice(index + 1).trim()]
      })
  )
}

function reachable(host, port) {
  return new Promise(resolve => {
    const socket = net.connect({ host, port: Number(port) })
    const finish = result => {
      socket.destroy()
      resolve(result)
    }
    socket.setTimeout(2000, () => finish(false))
    socket.once('connect', () => finish(true))
    socket.once('error', () => finish(false))
  })
}

async function infrastructureReady(target) {
  const envFile = path.join(target.dir, '.env.testing')
  if (!existsSync(envFile)) {
    console.error(
      `  apps/${target.app}/.env.testing not found: copy config/.env.testing.example to .env.testing and fill it in`
    )
    return false
  }
  const env = readEnvFile(envFile)
  const services = [
    ['MySQL', env.DB_HOST, env.DB_PORT || '3306', 'DB_HOST'],
    ['Redis', env.REDIS_HOST, env.REDIS_PORT || '6379', 'REDIS_HOST']
  ]
  const missing = services.filter(([, host]) => !host)
  for (const [, , , variable] of missing) {
    console.error(`  ${variable} is missing in apps/${target.app}/.env.testing`)
  }
  if (missing.length > 0) {
    return false
  }
  const down = []
  for (const [name, host, port] of services) {
    if (!(await reachable(host, port))) {
      down.push(`${name} (${host}:${port})`)
    }
  }
  if (down.length > 0) {
    console.error(
      [
        `  not reachable: ${down.join(', ')}`,
        '  The integration tests need MySQL and Redis. Start them with ./dev.sh --infra and run the gate again.',
        '  INTEGRATION_SKIP=1 skips this gate, leaving the integration tests unverified.'
      ].join('\n')
    )
    return false
  }
  return true
}

function partsToRun(target, triggered) {
  return PARTS.filter(
    part =>
      existsSync(path.join(target.dir, '__tests__', part.dir)) &&
      (target.touched || (triggered && part.dir === 'contracts'))
  )
}

export async function integrationGate(scope, app, { triggers = [] } = {}) {
  const target = appScope(scope, app)
  const triggered = scope.files.some(file =>
    triggers.some(prefix => file.startsWith(prefix))
  )
  if (!target.touched && !triggered) {
    console.log(`  ${app}: no changed files`)
    return NOOP
  }
  const parts = partsToRun(target, triggered)
  if (parts.length === 0) {
    console.log(`  ${app}: no __tests__/integration or __tests__/contracts`)
    return NOOP
  }
  if (process.env.INTEGRATION_SKIP === '1') {
    banner([
      `INTEGRATION_SKIP=1: the ${app} integration tests did NOT run.`,
      `Unverified: ${parts.map(part => part.script).join(', ')}.`
    ])
    return SKIPPED
  }
  const missingScripts = parts.filter(
    part => !hasNpmScript(target.dir, part.script)
  )
  for (const part of missingScripts) {
    console.error(
      `  apps/${app} has __tests__/${part.dir} but no "${part.script}" script`
    )
  }
  if (missingScripts.length > 0 || !(await infrastructureReady(target))) {
    return false
  }
  return parts.map(part => runNpmScript(target.dir, part.script)).every(Boolean)
}
