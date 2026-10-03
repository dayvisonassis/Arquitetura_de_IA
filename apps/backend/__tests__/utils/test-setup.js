const db = require('../../database')
const { quit } = require('../../redis-client')

// The F01 harness only hands out the database module. F04 adds the test user,
// the domain copy and __tests__/utils/auth.js with generateToken.
function setupTestDatabase() {
  return Promise.resolve({ db, user: null, domain: null })
}

async function cleanupTestDatabase() {
  await Promise.all([db.destroy(), quit()])
}

module.exports = { setupTestDatabase, cleanupTestDatabase }
