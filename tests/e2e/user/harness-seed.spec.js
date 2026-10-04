const { test, expect } = require('../fixtures')

test.describe('harness seed: user profile', () => {
  test(
    'lands on the app carrying the stored user session',
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
