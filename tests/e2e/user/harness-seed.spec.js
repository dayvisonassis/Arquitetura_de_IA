const { test, expect } = require('../fixtures')

test.describe('harness seed: user profile', () => {
  test(
    'lands on the playground carrying the stored user session, in the domain of the admin profile',
    { tag: ['@harness'] },
    async ({ page, userApi, adminApi }) => {
      const userMe = await userApi.get('/v2/me')
      const adminMe = await adminApi.get('/v2/me')
      expect(userMe.status()).toBe(200)
      expect(adminMe.status()).toBe(200)
      const user = await userMe.json()
      const admin = await adminMe.json()
      expect(user.role).toBe('user')
      // Deletes are domain-scoped: both accounts must share one domain (GATES.md, e2e-frontend)
      expect(user.domain.id).toBe(admin.domain.id)

      await page.goto('/')

      await expect(page).toHaveURL(/\/playground$/)
      await expect(page.getByRole('button', { name: 'Sair' })).toBeVisible()
    }
  )
})
