const { test, expect } = require('../fixtures')

test.describe('harness seed: agent profile', () => {
  test(
    'lands on the app carrying the stored agent session',
    { tag: ['@harness'] },
    async ({ page }) => {
      const response = await page.goto('/')

      expect(response.ok()).toBe(true)
      await expect(page.locator('tails-root')).toBeAttached()
      const token = await page.evaluate(
        () => JSON.parse(localStorage.getItem('currentUser') || '{}').token
      )
      expect(token).toBeTruthy()
    }
  )
})
