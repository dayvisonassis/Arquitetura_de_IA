import { expect, test } from '@playwright/test';

// Semente do harness: prova que o runner alcança o app e que o layout renderiza.
// Não testa o produto. Os testes de feature ficam ao lado, um fluxo por arquivo.
test('semente: a página inicial carrega o layout', async ({ page }) => {
  const response = await page.goto('/');

  expect(response?.status()).toBe(200);
  await expect(page.locator('nav')).toBeVisible();
});
