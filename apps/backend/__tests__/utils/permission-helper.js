const { randomUUID } = require('crypto')
const bcrypt = require('bcrypt')
const db = require('../../database')

// Fake credentials for the web_test schema only; never a real account.
const TEST_PASSWORD = 'Integration-pass-01'

const dbWrite = () => db.getDb({ operation: 'write' })
const toBin = uuid => Buffer.from(uuid.replace(/-/g, ''), 'hex')
const uniqueEmail = prefix =>
  `${prefix}-${randomUUID().slice(0, 8)}@example.test`

let passwordHash = null
const hashedTestPassword = async () => {
  passwordHash ??= await bcrypt.hash(TEST_PASSWORD, 10)
  return passwordHash
}

async function createTestDomain({ status = 'active', name } = {}) {
  const id = randomUUID()
  await dbWrite()('dr_domain').insert({
    id: toBin(id),
    name: name ?? `Test domain ${id.slice(0, 8)}`,
    status
  })
  return { domain_id: id, status }
}

async function createTestUser({ domainId, role = 'user', email } = {}) {
  const id = randomUUID()
  const address = email ?? uniqueEmail(role)
  await dbWrite()('users').insert({
    id: toBin(id),
    dr_domain_id: toBin(domainId),
    name: `Test ${role}`,
    email: address,
    password_hash: await hashedTestPassword(),
    role
  })
  return { id, email: address, role, dr_domain_id: domainId }
}

async function createTestPlatformUser({ email } = {}) {
  const id = randomUUID()
  const address = email ?? uniqueEmail('platform')
  await dbWrite()('platform_users').insert({
    id: toBin(id),
    name: 'Test platform admin',
    email: address,
    password_hash: await hashedTestPassword()
  })
  return { id, email: address, role: 'platform_admin' }
}

async function deleteTestUser(id) {
  try {
    await dbWrite()('active_sessions').where('user_id', toBin(id)).delete()
    await dbWrite()('users').where('id', toBin(id)).delete()
  } catch (error) {
    console.error(`Could not delete test user ${id}: ${error.message}`)
  }
}

async function deleteTestPlatformUser(id) {
  try {
    await dbWrite()('active_sessions')
      .where('platform_user_id', toBin(id))
      .delete()
    await dbWrite()('platform_users').where('id', toBin(id)).delete()
  } catch (error) {
    console.error(`Could not delete test platform user ${id}: ${error.message}`)
  }
}

async function deleteTestDomain(id) {
  try {
    await dbWrite()('dr_domain').where('id', toBin(id)).delete()
  } catch (error) {
    console.error(`Could not delete test domain ${id}: ${error.message}`)
  }
}

module.exports = {
  TEST_PASSWORD,
  createTestDomain,
  createTestPlatformUser,
  createTestUser,
  deleteTestDomain,
  deleteTestPlatformUser,
  deleteTestUser
}
