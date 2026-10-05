import { randomUUID } from 'crypto'
import db from '../../database'
import { binToUuid, uuidToBin } from '../utils/uuid.utils'

const TABLE = 'active_sessions'
const USER_AGENT_LENGTH = 255

const reader = () => db.getDb({ operation: 'read' })
const writer = trx => trx ?? db.getDb({ operation: 'write' })
const optionalBin = value => (value ? uuidToBin(value) : null)

const toIdentity = row => {
  if (row.platform_user_id) {
    return {
      type: 'platform',
      id: binToUuid(row.platform_user_id),
      name: row.platform_name,
      email: row.platform_email,
      role: row.platform_role,
      domain: null
    }
  }
  return {
    type: 'domain',
    id: binToUuid(row.user_id),
    name: row.user_name,
    email: row.user_email,
    role: row.user_role,
    domain: row.dr_domain_id
      ? {
          id: binToUuid(row.dr_domain_id),
          name: row.domain_name,
          status: row.domain_status
        }
      : null
  }
}

class SessionModel {
  async create(
    { platformUserId, userId, expiresAt, ipAddress, userAgent },
    trx
  ) {
    const id = randomUUID()
    await writer(trx)(TABLE).insert({
      id: uuidToBin(id),
      platform_user_id: optionalBin(platformUserId),
      user_id: optionalBin(userId),
      expires_at: expiresAt,
      ip_address: ipAddress ?? null,
      user_agent: userAgent ? userAgent.slice(0, USER_AGENT_LENGTH) : null
    })
    return id
  }

  async findWithIdentity(sessionId) {
    const row = await reader()(`${TABLE} as s`)
      .leftJoin('platform_users as p', 'p.id', 's.platform_user_id')
      .leftJoin('users as u', 'u.id', 's.user_id')
      .leftJoin('dr_domain as d', 'd.id', 'u.dr_domain_id')
      .select(
        's.platform_user_id',
        's.user_id',
        's.expires_at',
        's.revoked_at',
        'p.name as platform_name',
        'p.email as platform_email',
        'p.role as platform_role',
        'u.name as user_name',
        'u.email as user_email',
        'u.role as user_role',
        'u.dr_domain_id',
        'd.name as domain_name',
        'd.status as domain_status'
      )
      .where('s.id', uuidToBin(sessionId))
      .first()
    if (!row) {
      return null
    }
    return {
      id: sessionId,
      expiresAt: row.expires_at,
      revokedAt: row.revoked_at,
      identity: toIdentity(row)
    }
  }

  revoke(sessionId, reason, trx) {
    return writer(trx)(TABLE)
      .where('id', uuidToBin(sessionId))
      .whereNull('revoked_at')
      .update({ revoked_at: new Date(), revoked_reason: reason })
  }

  revokeAllForUser(userId, reason, trx) {
    return writer(trx)(TABLE)
      .where('user_id', uuidToBin(userId))
      .whereNull('revoked_at')
      .where('expires_at', '>', new Date())
      .update({ revoked_at: new Date(), revoked_reason: reason })
  }

  revokeAllForDomain(domainId, reason, trx) {
    const domain = uuidToBin(domainId)
    return writer(trx)(TABLE)
      .whereIn('user_id', subquery =>
        subquery.select('id').from('users').where('dr_domain_id', domain)
      )
      .whereNull('revoked_at')
      .where('expires_at', '>', new Date())
      .update({ revoked_at: new Date(), revoked_reason: reason })
  }
}

export default new SessionModel()
