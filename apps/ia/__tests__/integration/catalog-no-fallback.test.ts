import path from 'path'
import request from 'supertest'
import app from '../../src/app'
import { config } from '../../src/config/env'
import { resetCatalogState, suspensionRows } from '../utils/catalog-state'
import { cleanupTestDatabase, setupTestDatabase } from '../utils/test-setup'

const AUTH = { Authorization: `Bearer ${config.masterKey}` }

describe('Catalog admin API with a capability without fallback', () => {
  beforeAll(async () => {
    // The catalog loads on the first request, so the fixture applies to this file.
    process.env.CATALOG_FILE = path.join(
      '__tests__',
      'fixtures',
      'catalog',
      'no-fallback.json'
    )
    await setupTestDatabase()
  })

  afterEach(async () => {
    await resetCatalogState()
  })

  afterAll(async () => {
    await cleanupTestDatabase()
  })

  it('should warn when suspending the primary of a capability without fallback', async () => {
    const response = await request(app)
      .post('/admin/deployments/openai-gpt-4-1-mini/suspend')
      .set(AUTH)
      .send({ reason: 'Incidente na OpenAI', actor: 'admin@aigateway.test' })

    expect(response.status).toBe(200)
    expect(response.body.deployment.state).toBe('suspended')
    expect(response.body.warnings).toEqual([
      "A capacidade 'ticket-classifier' ficará indisponível enquanto o deployment estiver suspenso."
    ])
    await expect(suspensionRows('openai-gpt-4-1-mini')).resolves.toHaveLength(1)
  })
})
