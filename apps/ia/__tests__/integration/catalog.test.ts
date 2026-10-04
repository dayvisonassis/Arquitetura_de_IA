import { readFileSync } from 'fs'
import path from 'path'
import request from 'supertest'
import app from '../../src/app'
import { config } from '../../src/config/env'
import { getRedis } from '../../redis-client'
import { resetCatalogState, suspensionRows } from '../utils/catalog-state'
import { cleanupTestDatabase, setupTestDatabase } from '../utils/test-setup'

type Item = Record<string, unknown>

const TRACE_ID = /^[0-9a-f]{32}$/
const ACTOR = 'admin_platform@aigateway.test'
const AUTH = { Authorization: `Bearer ${config.masterKey}` }

const versioned = JSON.parse(
  readFileSync(path.resolve(__dirname, '../../catalog/catalog.json'), 'utf8')
) as { capabilities: Item[]; deployments: Item[] }

const getCatalog = () => request(app).get('/admin/catalog').set(AUTH)

const post = (resource: string, body: Item) =>
  request(app).post(`/admin/${resource}`).set(AUTH).send(body)

const capabilityOf = (body: { capabilities: Item[] }, name: string) =>
  body.capabilities.find(item => item.name === name) as Item

const deploymentOf = (body: { deployments: Item[] }, name: string) =>
  body.deployments.find(item => item.name === name) as Item

describe('Catalog admin API', () => {
  beforeAll(async () => {
    await setupTestDatabase()
  })

  afterEach(async () => {
    await resetCatalogState()
  })

  afterAll(async () => {
    await cleanupTestDatabase()
  })

  it('GET /admin/catalog should mirror the versioned catalog file', async () => {
    const response = await getCatalog()

    expect(response.status).toBe(200)
    expect(response.headers['x-request-id']).toMatch(TRACE_ID)
    expect(response.body.capabilities).toEqual(
      versioned.capabilities.map(item => ({
        ...item,
        fallback: item.fallback ?? null,
        contract: item.contract ?? null,
        state: 'active',
        suspension: null
      }))
    )
    expect(response.body.deployments).toEqual(
      versioned.deployments.map(item => {
        const { credential_env: credential, ...rest } = item
        expect(credential).toEqual(expect.any(String))
        return {
          ...rest,
          param_mappings: item.param_mappings ?? {},
          fixed_params: item.fixed_params ?? {},
          state: 'active',
          suspension: null,
          cooldown_until: null
        }
      })
    )
    expect(response.body.capabilities.map((item: Item) => item.name)).toEqual(
      expect.arrayContaining([
        'developer-assistant',
        'architecture-advisor',
        'ticket-classifier'
      ])
    )
    expect(response.text).not.toContain('credential_env')
  })

  it('should require the master key', async () => {
    const response = await request(app).get('/admin/catalog')

    expect(response.status).toBe(401)
    expect(response.body.error.code).toBe('invalid_admin_key')
  })

  it('should suspend and resume a capability within 1 s', async () => {
    const suspended = await post('capabilities/developer-assistant/suspend', {
      reason: 'Pico de custo em investigação',
      actor: ACTOR
    })
    const afterSuspend = Date.now()
    const listedSuspended = await getCatalog()
    const suspendDelay = Date.now() - afterSuspend

    expect(suspended.status).toBe(200)
    expect(suspended.body.warnings).toEqual([])
    expect(suspended.body.capability).toMatchObject({
      name: 'developer-assistant',
      state: 'suspended',
      suspension: { reason: 'Pico de custo em investigação', actor: ACTOR }
    })
    expect(
      capabilityOf(listedSuspended.body, 'developer-assistant')
    ).toMatchObject({
      state: 'suspended',
      suspension: suspended.body.capability.suspension
    })
    expect(suspendDelay).toBeLessThan(1000)

    const resumed = await post('capabilities/developer-assistant/resume', {
      actor: ACTOR
    })
    const afterResume = Date.now()
    const listedActive = await getCatalog()
    const resumeDelay = Date.now() - afterResume

    expect(resumed.status).toBe(200)
    expect(resumed.body.capability).toMatchObject({
      state: 'active',
      suspension: null
    })
    expect(
      capabilityOf(listedActive.body, 'developer-assistant')
    ).toMatchObject({ state: 'active', suspension: null })
    expect(resumeDelay).toBeLessThan(1000)
  })

  it('should suspend and resume a deployment', async () => {
    const suspended = await post('deployments/gemini-2-5-flash/suspend', {
      reason: 'Chave do Google em rotação',
      actor: ACTOR
    })

    expect(suspended.status).toBe(200)
    expect(suspended.body.deployment).toMatchObject({
      name: 'gemini-2-5-flash',
      provider: 'gemini',
      model: 'gemini-2.5-flash',
      state: 'suspended',
      cooldown_until: null
    })
    expect(suspended.body.deployment).not.toHaveProperty('credential_env')
    const rows = await suspensionRows('gemini-2-5-flash')
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      resource_type: 'deployment',
      reason: 'Chave do Google em rotação',
      actor: ACTOR
    })
    expect(new Date(rows[0].suspended_at).toISOString()).toBe(
      suspended.body.deployment.suspension.suspended_at
    )

    const resumed = await post('deployments/gemini-2-5-flash/resume', {
      actor: ACTOR,
      reason: 'Chave nova instalada'
    })

    expect(resumed.status).toBe(200)
    expect(resumed.body.deployment.state).toBe('active')
    await expect(suspensionRows('gemini-2-5-flash')).resolves.toHaveLength(0)
  })

  it('should keep a suspension after the replica is lost', async () => {
    const suspended = await post('capabilities/ticket-classifier/suspend', {
      reason: 'Contrato em revisão',
      actor: ACTOR
    })
    const redis = await getRedis()
    await redis.del('catalog:suspensions')

    const listed = await getCatalog()

    expect(capabilityOf(listed.body, 'ticket-classifier')).toMatchObject({
      state: 'suspended',
      suspension: suspended.body.capability.suspension
    })
    await expect(suspensionRows('ticket-classifier')).resolves.toHaveLength(1)
    await expect(redis.hGet('catalog:suspensions', '_loaded')).resolves.toBe(
      '1'
    )
  })

  it('should answer 404 for an unknown resource', async () => {
    const capability = await post('capabilities/nao-existe/suspend', {
      reason: 'x',
      actor: ACTOR
    })
    const deployment = await post('deployments/nao-existe/suspend', {
      reason: 'x',
      actor: ACTOR
    })

    expect(capability.status).toBe(404)
    expect(capability.body.error).toEqual({
      code: 'not_found',
      type: 'invalid_request_error',
      message: "A capacidade 'nao-existe' não existe no catálogo."
    })
    expect(deployment.status).toBe(404)
    expect(deployment.body.error.message).toBe(
      "O deployment 'nao-existe' não existe no catálogo."
    )
    await expect(suspensionRows('nao-existe')).resolves.toHaveLength(0)
  })

  it('should answer 409 when suspending twice and resuming an active resource', async () => {
    await post('capabilities/architecture-advisor/suspend', {
      reason: 'Primeiro motivo',
      actor: ACTOR
    })

    const twice = await post('capabilities/architecture-advisor/suspend', {
      reason: 'Segundo motivo',
      actor: ACTOR
    })
    const activeResume = await post('deployments/openai-gpt-4-1/resume', {
      actor: ACTOR
    })
    const listed = await getCatalog()

    expect(twice.status).toBe(409)
    expect(twice.body.error).toEqual({
      code: 'invalid_state',
      type: 'invalid_request_error',
      message: "A capacidade 'architecture-advisor' já está suspensa."
    })
    expect(activeResume.status).toBe(409)
    expect(activeResume.body.error.message).toBe(
      "O deployment 'openai-gpt-4-1' não está suspenso."
    )
    expect(
      capabilityOf(listed.body, 'architecture-advisor').suspension
    ).toMatchObject({ reason: 'Primeiro motivo' })
  })

  it.each([
    [
      { actor: ACTOR },
      "O campo 'reason' é obrigatório e aceita até 200 caracteres."
    ],
    [
      { reason: 'r'.repeat(201), actor: ACTOR },
      "O campo 'reason' é obrigatório e aceita até 200 caracteres."
    ],
    [{ reason: 'x' }, "O campo 'actor' precisa ser um e-mail."],
    [{ reason: 'x', actor: 'admin' }, "O campo 'actor' precisa ser um e-mail."],
    [{ reason: 'x', actor: ACTOR, foo: 1 }, "O campo 'foo' não é aceito."]
  ])(
    'should answer 400 for missing, invalid or unexpected fields: %p',
    async (body, message) => {
      const response = await post('deployments/openai-gpt-4-1/suspend', body)

      expect(response.status).toBe(400)
      expect(response.body.error).toEqual({
        code: 'invalid_value',
        type: 'invalid_request_error',
        message
      })
      await expect(suspensionRows('openai-gpt-4-1')).resolves.toHaveLength(0)
    }
  )

  it('should show a cooldown written in Redis', async () => {
    const redis = await getRedis()
    const until = new Date(Date.now() + 30000).toISOString()
    await redis.set('catalog:cooldown:openai-gpt-4-1', until, { PX: 30000 })

    const listed = await getCatalog()

    expect(deploymentOf(listed.body, 'openai-gpt-4-1')).toMatchObject({
      state: 'cooldown',
      suspension: null,
      cooldown_until: until
    })
  })
})
