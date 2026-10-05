import bcrypt from 'bcrypt'
import jwt from 'jsonwebtoken'
import db from '../../database'
import { config } from '../config/env'
import DomainModel from '../api/v2/models/domain.model'
import UserModel from '../api/v2/models/user.model'
import PlatformUserModel from '../models/platform-user.model'
import SessionModel from '../models/session.model'
import { AppError, MESSAGES, accountLocked } from '../utils/app-error.utils'
import { formatClockTime } from '../utils/datetime.utils'
import { normalizeEmail } from '../utils/email.utils'
import { BCRYPT_COST, validatePassword } from '../utils/password.utils'

const SESSION_MS = 8 * 60 * 60 * 1000
const MAX_FAILURES = 5
const LOCK_MS = 15 * 60 * 1000
const PLACEHOLDER_PASSWORD = 'placeholder-password-for-timing'

let placeholderHash = null

const getPlaceholderHash = async () => {
  placeholderHash ??= await bcrypt.hash(PLACEHOLDER_PASSWORD, BCRYPT_COST)
  return placeholderHash
}

const compareWithPlaceholder = async password => {
  await bcrypt.compare(String(password), await getPlaceholderHash())
  return false
}

const passwordMatches = (password, hash) =>
  validatePassword(password).valid
    ? bcrypt.compare(password, hash)
    : compareWithPlaceholder(password)

const invalidCredentials = () => new AppError(401, MESSAGES.invalidCredentials)

const lockedError = lockedUntil =>
  accountLocked(lockedUntil, formatClockTime(lockedUntil))

const toSecond = time => new Date(Math.floor(time / 1000) * 1000)

const findAccount = async (email, trx) => {
  const platformUser = await PlatformUserModel.findByEmailForUpdate(email, trx)
  if (platformUser) {
    return { type: 'platform', account: platformUser, model: PlatformUserModel }
  }
  const user = await UserModel.findByEmailForUpdate(email, trx)
  return user ? { type: 'domain', account: user, model: UserModel } : null
}

const registerFailure = async ({ account, model }, now, trx) => {
  const failures = account.failedAttempts + 1
  if (failures >= MAX_FAILURES) {
    const lockedUntil = new Date(now.getTime() + LOCK_MS)
    await model.registerFailure(
      account.id,
      { failedAttempts: 0, lockedUntil },
      trx
    )
    return lockedError(lockedUntil)
  }
  await model.registerFailure(
    account.id,
    { failedAttempts: failures, lockedUntil: null },
    trx
  )
  return invalidCredentials()
}

const domainIsActive = async (account, trx) => {
  const domain = await DomainModel.findById(account.domainId, trx)
  return domain?.status === 'active'
}

const signToken = (sessionId, user, expiresAt) =>
  jwt.sign(
    {
      data: { session_id: sessionId, user },
      exp: Math.floor(expiresAt.getTime() / 1000)
    },
    config.jwtSecret,
    { algorithm: 'HS256' }
  )

const tokenUser = ({ type, account }) =>
  type === 'platform'
    ? { id: account.id, type }
    : { id: account.id, type, dr_domain_id: account.domainId }

const attempt = async ({ email, password, ipAddress, userAgent }, trx) => {
  const found = await findAccount(normalizeEmail(email), trx)
  if (!found) {
    await compareWithPlaceholder(password)
    return { error: invalidCredentials() }
  }
  const { type, account, model } = found
  const now = new Date()
  if (account.lockedUntil && account.lockedUntil > now) {
    return { error: lockedError(account.lockedUntil) }
  }
  if (!(await passwordMatches(password, account.passwordHash))) {
    return { error: await registerFailure(found, now, trx) }
  }
  if (type === 'domain' && !(await domainIsActive(account, trx))) {
    await UserModel.resetFailures(account.id, trx)
    return { error: new AppError(403, MESSAGES.domainInactive) }
  }
  await model.registerSuccess(account.id, trx)
  const expiresAt = toSecond(now.getTime() + SESSION_MS)
  const sessionId = await SessionModel.create(
    {
      platformUserId: type === 'platform' ? account.id : null,
      userId: type === 'domain' ? account.id : null,
      expiresAt,
      ipAddress,
      userAgent
    },
    trx
  )
  return {
    token: signToken(sessionId, tokenUser(found), expiresAt),
    expiresAt
  }
}

export const login = async credentials => {
  const outcome = await db
    .getDb({ operation: 'write' })
    .transaction(trx => attempt(credentials, trx))
  if (outcome.error) {
    throw outcome.error
  }
  return { token: outcome.token, expires_at: outcome.expiresAt.toISOString() }
}

export const logout = sessionId => SessionModel.revoke(sessionId, 'logout')
