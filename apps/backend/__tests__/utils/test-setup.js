const bcrypt = require('bcrypt')
const db = require('../../database')
const { quit } = require('../../redis-client')
const { deleteGeneratedSessions } = require('./auth')
const { TEST_PASSWORD } = require('./permission-helper')

// Shared fixtures of web_test: created when missing and kept between runs.
const DOMAIN = {
  domain_id: '7c2e9a14-3b6d-4e1f-8a5c-2d9b0e4f1a37',
  name: 'Domínio de integração',
  status: 'active'
}
const USER = {
  id: '7c2e9a14-3b6d-4e1f-8a5c-2d9b0e4f1a38',
  email: 'integration-admin@example.test',
  name: 'Integration admin',
  role: 'domain_admin'
}

const toBin = uuid => Buffer.from(uuid.replace(/-/g, ''), 'hex')

async function setupTestDatabase() {
  const dbWrite = db.getDb({ operation: 'write' })
  await dbWrite('dr_domain')
    .insert({
      id: toBin(DOMAIN.domain_id),
      name: DOMAIN.name,
      status: DOMAIN.status
    })
    .onConflict()
    .ignore()
  await dbWrite('users')
    .insert({
      id: toBin(USER.id),
      dr_domain_id: toBin(DOMAIN.domain_id),
      name: USER.name,
      email: USER.email,
      password_hash: await bcrypt.hash(TEST_PASSWORD, 10),
      role: USER.role
    })
    .onConflict()
    .ignore()
  return {
    db,
    user: { ...USER, dr_domain_id: DOMAIN.domain_id },
    domain: { ...DOMAIN }
  }
}

async function cleanupTestDatabase() {
  await deleteGeneratedSessions()
  await Promise.all([db.destroy(), quit()])
}

module.exports = { setupTestDatabase, cleanupTestDatabase }
