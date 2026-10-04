const { test, expect } = require('../fixtures')

test.describe('harness seed: platform_admin profile', () => {
  test(
    'lands on the domains screen carrying the stored platform admin session',
    { tag: ['@harness'] },
    async ({ page, platformAdminApi }) => {
      const me = await platformAdminApi.get('/v2/me')
      expect(me.status()).toBe(200)
      const body = await me.json()
      expect(body.role).toBe('platform_admin')
      expect(body.domain).toBeNull()

      await page.goto('/')

      await expect(page).toHaveURL(/\/domains$/)
      await expect(page.getByRole('button', { name: 'Sair' })).toBeVisible()
    }
  )
})
