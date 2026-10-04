import { readFileSync } from 'fs'
import path from 'path'
import { assertCatalog } from '../../src/config/catalog'

// The test catalog points every deployment to the simulator (F03). It must
// stay a mirror of the versioned catalog: only the provider changes and the
// credential goes away. It lives in the integration suite because a change
// to a catalog JSON alone does not trigger the unit gate.
type Item = Record<string, unknown>
type CatalogFile = { deployments: Item[]; capabilities: Item[] }

const CATALOG_DIR = path.resolve(__dirname, '..', '..', 'catalog')

const readCatalog = (file: string): CatalogFile =>
  JSON.parse(readFileSync(path.join(CATALOG_DIR, file), 'utf8'))

const withoutDestination = (deployment: Item): Item =>
  Object.fromEntries(
    Object.entries(deployment).filter(
      ([key]) => key !== 'provider' && key !== 'credential_env'
    )
  )

describe('simulated catalog', () => {
  const real = readCatalog('catalog.json')
  const simulated = readCatalog('catalog.simulated.json')

  it('the simulated catalog should be valid without provider credentials', () => {
    // No OPENAI_API_KEY or GEMINI_API_KEY: the real catalog is refused with
    // this environment, so the simulated one passing proves it needs none.
    const env = { NODE_ENV: 'testing' }

    expect(() =>
      assertCatalog({ ...env, CATALOG_FILE: 'catalog/catalog.json' })
    ).toThrow(/OPENAI_API_KEY/)
    expect(() =>
      assertCatalog({ ...env, CATALOG_FILE: 'catalog/catalog.simulated.json' })
    ).not.toThrow()
  })

  it('the simulated catalog should mirror the versioned catalog', () => {
    expect(Object.keys(simulated).sort()).toEqual(Object.keys(real).sort())
    for (const deployment of simulated.deployments) {
      expect(deployment.provider).toBe('simulated')
      expect(deployment).not.toHaveProperty('credential_env')
    }
    expect(simulated.deployments.map(withoutDestination)).toEqual(
      real.deployments.map(withoutDestination)
    )
    expect(simulated.capabilities).toEqual(real.capabilities)
  })

  it('each simulated deployment should have its own model', () => {
    // The simulator keys its modes by model name, so two deployments sharing
    // a model could not fail independently.
    const models = simulated.deployments.map(deployment => deployment.model)

    expect(new Set(models).size).toBe(models.length)
  })
})
