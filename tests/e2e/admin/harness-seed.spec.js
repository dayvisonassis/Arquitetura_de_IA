const { test, expect } = require('../fixtures')

test.describe('harness seed: admin profile', () => {
  test(
    'lands on the users screen carrying the stored domain admin session',
    { tag: ['@harness'] },
    async ({ page, adminApi }) => {
      const me = await adminApi.get('/v2/me')
      expect(me.status()).toBe(200)
      const body = await me.json()
      expect(body.role).toBe('domain_admin')
      expect(body.domain).not.toBeNull()

      await page.goto('/')

      await expect(page).toHaveURL(/\/users$/)
      await expect(page.getByRole('button', { name: 'Sair' })).toBeVisible()
    }
  )
})
