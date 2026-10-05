const { randomUUID } = require('crypto')
const bcrypt = require('bcrypt')
const { config } = require('../../src/config/env')
const { normalizeEmail } = require('../../src/utils/email.utils')
const {
  BCRYPT_COST,
  RULE_MESSAGES,
  validatePassword
} = require('../../src/utils/password.utils')

const ACTIVE_DOMAIN_ID = '5a1f3c2e-8d4b-4f6a-9b2c-7e1d0f3a6b45'
const INACTIVE_DOMAIN_ID = '5a1f3c2e-8d4b-4f6a-9b2c-7e1d0f3a6b46'

const DOMAINS = [
  { id: ACTIVE_DOMAIN_ID, name: 'Domínio de teste', status: 'active' },
  {
    id: INACTIVE_DOMAIN_ID,
    name: 'Domínio inativo de teste',
    status: 'inactive'
  }
]

const ACCOUNTS = [
  {
    email: 'admin@temporario.com',
    name: 'Administrador de teste',
    role: 'domain_admin',
    domainId: ACTIVE_DOMAIN_ID
  },
  {
    email: 'user@temporario.com',
    name: 'Usuário de teste',
    role: 'user',
    domainId: ACTIVE_DOMAIN_ID
  },
  {
    email: 'inativo@temporario.com',
    name: 'Usuário do domínio inativo',
    role: 'user',
    domainId: INACTIVE_DOMAIN_ID
  }
]

const toBin = uuid => Buffer.from(uuid.replace(/-/g, ''), 'hex')

exports.seed = async knex => {
  if (config.nodeEnv !== 'development') {
    console.warn('dev_accounts: skipped outside the development environment')
    return
  }
  const { valid, rule } = validatePassword(config.platformAdmin.password)
  if (!valid) {
    throw new Error(
      `dev_accounts: PLATFORM_ADMIN_PASSWORD ${RULE_MESSAGES[rule]}`
    )
  }
  const emails = ACCOUNTS.map(account => normalizeEmail(account.email))
  const conflicts = await knex('platform_users')
    .select('email')
    .whereIn('email', emails)
  if (conflicts.length > 0) {
    const taken = conflicts.map(row => row.email).join(', ')
    throw new Error(`dev_accounts: ${taken} already used in platform_users`)
  }
  await knex('dr_domain')
    .insert(
      DOMAINS.map(domain => ({
        id: toBin(domain.id),
        name: domain.name,
        status: domain.status
      }))
    )
    .onConflict()
    .ignore()
  const passwordHash = await bcrypt.hash(
    config.platformAdmin.password,
    BCRYPT_COST
  )
  await knex('users')
    .insert(
      ACCOUNTS.map(account => ({
        id: toBin(randomUUID()),
        dr_domain_id: toBin(account.domainId),
        name: account.name,
        email: normalizeEmail(account.email),
        password_hash: passwordHash,
        role: account.role
      }))
    )
    .onConflict()
    .ignore()
}
