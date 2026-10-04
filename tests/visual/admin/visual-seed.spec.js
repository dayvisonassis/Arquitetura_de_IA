const { test, expect } = require('@playwright/test')

test.describe('visual seed: authenticated shell', () => {
  test(
    'renders the page-shell title at 17px and weight 600',
    { tag: ['@harness'] },
    async ({ page }) => {
      await page.goto('/')
      await expect(page.getByRole('button', { name: 'Sair' })).toBeVisible()
      const title = page.locator('.content-header h1')
      await expect(title).toBeVisible()

      const style = await title.evaluate(element => {
        const computed = getComputedStyle(element)
        return { size: computed.fontSize, weight: computed.fontWeight }
      })

      expect(style).toEqual({ size: '17px', weight: '600' })
    }
  )
})
