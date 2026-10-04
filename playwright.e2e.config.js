const { defineConfig, devices } = require('@playwright/test')
const { BASE_URL, storageStatePath } = require('./tests/e2e/sessions')

const profile = name => ({
  name,
  testDir: `./tests/e2e/${name}`,
  use: { ...devices['Desktop Chrome'], storageState: storageStatePath(name) }
})

module.exports = defineConfig({
  testDir: './tests/e2e',
  outputDir: 'test-results/e2e',
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
  projects: [profile('admin'), profile('user')]
})
