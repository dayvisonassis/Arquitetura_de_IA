import { randomUUID } from 'crypto'
import db from '../../database'
import { binToUuid, uuidToBin } from '../utils/uuid.utils'

const TABLE = 'platform_users'
const COLUMNS = [
  'id',
  'name',
  'email',
  'password_hash',
  'role',
  'failed_attempts',
  'locked_until'
]

const reader = trx => trx ?? db.getDb({ operation: 'read' })
const writer = trx => trx ?? db.getDb({ operation: 'write' })

const toAccount = row =>
  row
    ? {
        id: binToUuid(row.id),
        name: row.name,
        email: row.email,
        passwordHash: row.password_hash,
        role: row.role,
        failedAttempts: row.failed_attempts,
        lockedUntil: row.locked_until
      }
    : null

class PlatformUserModel {
  async findByEmail(email, trx) {
    const row = await reader(trx)(TABLE)
      .select(COLUMNS)
      .where('email', email)
      .first()
    return toAccount(row)
  }

  async findByEmailForUpdate(email, trx) {
    const row = await trx(TABLE)
      .select(COLUMNS)
      .where('email', email)
      .forUpdate()
      .first()
    return toAccount(row)
  }

  async existsAny(trx) {
    const row = await reader(trx)(TABLE).select('id').first()
    return Boolean(row)
  }

  async emailExists(email, trx) {
    const row = await reader(trx)(TABLE)
      .select('id')
      .where('email', email)
      .first()
    return Boolean(row)
  }

  async create({ name, email, passwordHash }, trx) {
    const id = randomUUID()
    await writer(trx)(TABLE).insert({
      id: uuidToBin(id),
      name,
      email,
      password_hash: passwordHash
    })
    return id
  }

  registerFailure(id, { failedAttempts, lockedUntil }, trx) {
    return writer(trx)(TABLE).where('id', uuidToBin(id)).update({
      failed_attempts: failedAttempts,
      locked_until: lockedUntil,
      updated_at: new Date()
    })
  }

  registerSuccess(id, trx) {
    const now = new Date()
    return writer(trx)(TABLE).where('id', uuidToBin(id)).update({
      failed_attempts: 0,
      locked_until: null,
      last_login_at: now,
      updated_at: now
    })
  }
}

export default new PlatformUserModel()
