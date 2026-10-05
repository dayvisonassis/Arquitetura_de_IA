import jwt from 'jsonwebtoken'
import { config } from '../config/env'
import PermissionModel from '../api/v2/models/permission.model'
import SessionModel from '../models/session.model'
import { unauthorized } from '../utils/app-error.utils'
import { isUuid, uuidToBin } from '../utils/uuid.utils'

const BEARER = /^Bearer (\S+)$/

const readPayload = header => {
  const match = BEARER.exec(header ?? '')
  if (!match) {
    return null
  }
  try {
    return jwt.verify(match[1], config.jwtSecret, { algorithms: ['HS256'] })
  } catch {
    return null
  }
}

const belongsTo = ({ identity }, user) => {
  if (identity.type !== user.type || identity.id !== user.id) {
    return false
  }
  if (identity.type === 'platform') {
    return true
  }
  return (
    identity.domain?.status === 'active' &&
    identity.domain.id === user.dr_domain_id
  )
}

const isUsable = (session, user) =>
  Boolean(session) &&
  !session.revokedAt &&
  session.expiresAt > new Date() &&
  belongsTo(session, user)

const applyContext = (req, { id, identity }, permissions) => {
  const isPlatform = identity.type === 'platform'
  req.sessionId = id
  req.identityType = identity.type
  req.platformUserId = isPlatform ? identity.id : null
  req.userId = isPlatform ? null : identity.id
  req.role = identity.role
  req.domainId = isPlatform ? null : identity.domain.id
  req.domainInBinary = isPlatform ? null : uuidToBin(identity.domain.id)
  req.permissions = new Set(permissions)
  req.currentUser = {
    id: identity.id,
    name: identity.name,
    email: identity.email,
    role: identity.role,
    domain: isPlatform
      ? null
      : { id: identity.domain.id, name: identity.domain.name }
  }
}

export const authenticate = async (req, _res, next) => {
  try {
    const payload = readPayload(req.get('authorization'))
    const sessionId = payload?.data?.session_id
    const user = payload?.data?.user
    if (!isUuid(sessionId) || !user) {
      throw unauthorized()
    }
    const session = await SessionModel.findWithIdentity(sessionId)
    if (!isUsable(session, user)) {
      throw unauthorized()
    }
    const permissions = await PermissionModel.findByRole(session.identity.role)
    applyContext(req, session, permissions)
    next()
  } catch (error) {
    next(error)
  }
}
