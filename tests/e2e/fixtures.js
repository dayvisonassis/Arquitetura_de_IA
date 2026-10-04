const base = require('@playwright/test')
const { API_URL, readToken } = require('./sessions')

function apiFixture(profile) {
  return async ({ playwright }, use) => {
    const token = readToken(profile)
    if (!token) {
      throw new Error(
        `No stored session for the ${profile} profile: the harness global setup must run first`
      )
    }
    const context = await playwright.request.newContext({
      baseURL: API_URL,
      extraHTTPHeaders: { Authorization: `Bearer ${token}` }
    })
    await use(context)
    await context.dispose()
  }
}

const test = base.test.extend({
  platformAdminApi: apiFixture('platform_admin'),
  adminApi: apiFixture('admin'),
  userApi: apiFixture('user')
})

module.exports = { test, expect: base.expect }
