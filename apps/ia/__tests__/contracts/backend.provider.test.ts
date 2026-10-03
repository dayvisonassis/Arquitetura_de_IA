import { readdirSync, readFileSync } from 'fs'
import http from 'http'
import type { AddressInfo } from 'net'
import path from 'path'
import express, { type Express, type RequestHandler } from 'express'
import { Verifier } from '@pact-foundation/pact'
import app from '../../src/app'

const PROVIDER = 'ai-gateway-ia'
const PACTS_DIR = path.resolve(
  __dirname,
  '..',
  '..',
  '..',
  '..',
  'contracts',
  'pacts'
)

// Every committed pact whose provider is this app, whatever the consumer.
const pactFiles = (): string[] =>
  readdirSync(PACTS_DIR)
    .filter(name => name.endsWith('.json'))
    .map(name => path.join(PACTS_DIR, name))
    .filter(
      file => JSON.parse(readFileSync(file, 'utf8')).provider?.name === PROVIDER
    )

const listen = async (handler: Express): Promise<http.Server> => {
  const server = http.createServer(handler)
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  return server
}

const close = (server: http.Server): Promise<void> =>
  new Promise((resolve, reject) =>
    server.close(error => (error ? reject(error) : resolve()))
  )

const verify = async (handler: Express): Promise<unknown> => {
  const server = await listen(handler)
  try {
    return await new Verifier({
      provider: PROVIDER,
      providerBaseUrl: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
      pactUrls: pactFiles(),
      logLevel: 'error'
    }).verifyProvider()
  } finally {
    await close(server)
  }
}

// The real app behind a test-only middleware that changes what the backend
// relies on: the negative proof that a provider change breaks the contract.
const drifting = (middleware: RequestHandler): Express => {
  const wrapper = express()
  wrapper.use(middleware)
  wrapper.use(app)
  return wrapper
}

const renameErrorCode: RequestHandler = (_req, res, next) => {
  const json = res.json.bind(res)
  res.json = body => {
    if (body?.error?.code === 'invalid_admin_key') {
      return json({ error: { ...body.error, code: 'invalid_key' } })
    }
    return json(body)
  }
  next()
}

const dropRequestId: RequestHandler = (_req, res, next) => {
  const setHeader = res.setHeader.bind(res)
  res.setHeader = (name, value) =>
    String(name).toLowerCase() === 'x-request-id' ? res : setHeader(name, value)
  next()
}

describe('backend pacts (provider)', () => {
  it('should find the backend pact', () => {
    expect(pactFiles().map(file => path.basename(file))).toContain(
      'ai-gateway-backend-ai-gateway-ia.json'
    )
  })

  it('should satisfy the backend pact', async () => {
    await expect(verify(app)).resolves.toBeDefined()
  })

  it.each([
    ['the 401 error code changes', renameErrorCode],
    ['the x-request-id header is dropped', dropRequestId]
  ])(
    'should fail verification when the response drifts (%s)',
    async (_case, middleware) => {
      await expect(verify(drifting(middleware))).rejects.toThrow()
    }
  )
})
