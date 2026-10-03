import { defineConfig, devices } from '@playwright/test';

// Gate `e2e` — fluxos de usuário contra o app no ar (ver GATES.md).
// Não sobe o app: scripts/runGate.mjs confere antes se ele responde e, se não, falha com instruções.
export default defineConfig({
  testDir: 'tests/e2e',
  outputDir: 'test-results/e2e',
  forbidOnly: true,
  retries: 0,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://127.0.0.1:3000',
    headless: true,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  // Um projeto por sessão: a pasta do teste decide com que sessão ele roda.
  // Sem login até a F04, só existe o projeto `public`.
  projects: [{ name: 'public', testDir: 'tests/e2e/public', use: { ...devices['Desktop Chrome'] } }],
});
