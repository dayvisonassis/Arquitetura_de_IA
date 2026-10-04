const { test, expect } = require('@playwright/test')

test.describe('visual seed: sign-in screen', () => {
  test(
    'renders the e-mail field at the compact 38px height',
    { tag: ['@harness'] },
    async ({ page }) => {
      await page.goto('/login')
      // Measure the text-field wrapper: the form-field host also counts the subscript space (design system)
      const wrapper = page.locator('.mat-mdc-text-field-wrapper').first()
      await expect(wrapper).toBeVisible()

      const height = await wrapper.evaluate(
        element => element.getBoundingClientRect().height
      )

      expect(height).toBeCloseTo(38, 0)
    }
  )
})
