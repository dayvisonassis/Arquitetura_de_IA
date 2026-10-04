import { spawn, type ChildProcess } from 'child_process'
import { createServer } from 'net'
import path from 'path'

// Starts the real simulator (index.ts) as a child process on a free port of
// 127.0.0.1, so the tests talk to it only over HTTP, like the proxy will.
const APP_DIR = path.resolve(__dirname, '..', '..')
const READY_TIMEOUT_MS = 20000
const POLL_INTERVAL_MS = 100

export type SimulatorProcess = {
  baseUrl: string
  stop: () => Promise<void>
}

const freePort = (): Promise<number> =>
  new Promise((resolve, reject) => {
    const server = createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      const port = typeof address === 'object' && address ? address.port : 0
      server.close(() => resolve(port))
    })
  })

const sleep = (ms: number): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, ms))

const isLive = async (baseUrl: string): Promise<boolean> => {
  try {
    const response = await fetch(`${baseUrl}/health/live`)
    return response.ok
  } catch {
    return false
  }
}

const hasExited = (child: ChildProcess): boolean =>
  child.exitCode !== null || child.signalCode !== null

const waitForExit = (child: ChildProcess): Promise<void> =>
  new Promise(resolve => {
    if (hasExited(child)) {
      resolve()
      return
    }
    child.once('exit', () => resolve())
  })

export const startSimulator = async (): Promise<SimulatorProcess> => {
  const port = await freePort()
  const baseUrl = `http://127.0.0.1:${port}`
  // No shell: on Windows cmd.exe would sit between the test and node, and
  // kill() would stop only the shell.
  const child = spawn(
    process.execPath,
    ['-r', 'ts-node/register/transpile-only', 'index.ts'],
    {
      cwd: APP_DIR,
      env: {
        ...process.env,
        NODE_ENV: 'testing',
        API_HOST: '127.0.0.1',
        PORT: String(port)
      },
      stdio: ['ignore', 'ignore', 'pipe']
    }
  )
  let stderr = ''
  child.stderr?.on('data', chunk => {
    stderr += String(chunk)
  })
  child.once('error', error => {
    stderr += error.message
  })

  const stop = async (): Promise<void> => {
    if (!hasExited(child)) {
      child.kill()
    }
    await waitForExit(child)
  }

  const deadline = Date.now() + READY_TIMEOUT_MS
  while (Date.now() < deadline) {
    if (hasExited(child)) {
      throw new Error(
        `The simulator exited before answering /health/live: ${stderr}`
      )
    }
    if (await isLive(baseUrl)) {
      return { baseUrl, stop }
    }
    await sleep(POLL_INTERVAL_MS)
  }
  await stop()
  throw new Error(
    `The simulator did not answer /health/live within ${READY_TIMEOUT_MS} ms: ${stderr}`
  )
}
