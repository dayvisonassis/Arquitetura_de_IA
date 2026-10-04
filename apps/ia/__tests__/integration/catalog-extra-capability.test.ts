import path from 'path'
import request from 'supertest'
import app from '../../src/app'
import { config } from '../../src/config/env'
import { resetCatalogState } from '../utils/catalog-state'
import { cleanupTestDatabase, setupTestDatabase } from '../utils/test-setup'

const AUTH = { Authorization: `Bearer ${config.masterKey}` }

describe('Catalog admin API with a capability added only in the file', () => {
  beforeAll(async () => {
    // The catalog loads on the first request, so the fixture applies to this file.
    process.env.CATALOG_FILE = path.join(
      '__tests__',
      'fixtures',
      'catalog',
      'extra-capability.json'
    )
    await setupTestDatabase()
  })

  afterAll(async () => {
    await resetCatalogState()
    await cleanupTestDatabase()
  })

  it('should list a capability added only in the catalog file', async () => {
    const response = await request(app).get('/admin/catalog').set(AUTH)

    expect(response.status).toBe(200)
    expect(response.body.capabilities).toContainEqual(
      expect.objectContaining({
        name: 'release-notes-writer',
        primary: 'openai-gpt-4-1-mini',
        fallback: 'gemini-2-5-flash',
        state: 'active'
      })
    )
  })
})
