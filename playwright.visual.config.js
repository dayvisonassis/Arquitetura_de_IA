const { defineConfig, devices } = require('@playwright/test')
const { BASE_URL, storageStatePath } = require('./tests/e2e/sessions')

const desktop = {
  ...devices['Desktop Chrome'],
  viewport: { width: 1440, height: 900 }
}

module.exports = defineConfig({
  testDir: './tests/visual',
  outputDir: 'test-results/visual',
  globalSetup: require.resolve('./tests/e2e/global-setup.js'),
  forbidOnly: true,
  retries: 0,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: BASE_URL,
    headless: true,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure'
  },
  projects: [
    {
      name: 'public',
      testDir: './tests/visual/public',
      use: { ...desktop, storageState: { cookies: [], origins: [] } }
    },
    {
      name: 'admin',
      testDir: './tests/visual/admin',
      use: { ...desktop, storageState: storageStatePath('admin') }
    }
  ]
})
