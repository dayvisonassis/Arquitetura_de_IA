const { randomUUID } = require('crypto')
const jwt = require('jsonwebtoken')
const db = require('../../database')
const { getClient } = require('../../redis-client')
const { config } = require('../../src/config/env')

const SESSION_MS = 8 * 60 * 60 * 1000
const createdSessions = []

const dbWrite = () => db.getDb({ operation: 'write' })
const toBin = uuid => Buffer.from(uuid.replace(/-/g, ''), 'hex')

// Creates the active session the authentication middleware checks, then signs
// a token shaped like the one POST /v2/auth/login returns.
async function generateToken({ user, platformUser, expiresAt } = {}) {
  const sessionId = randomUUID()
  const end =
    expiresAt ?? new Date(Math.floor((Date.now() + SESSION_MS) / 1000) * 1000)
  await dbWrite()('active_sessions').insert({
    id: toBin(sessionId),
    platform_user_id: platformUser ? toBin(platformUser.id) : null,
    user_id: user ? toBin(user.id) : null,
    expires_at: end
  })
  createdSessions.push(sessionId)
  const tokenUser = platformUser
    ? { id: platformUser.id, type: 'platform' }
    : { id: user.id, type: 'domain', dr_domain_id: user.dr_domain_id }
  return jwt.sign(
    {
      data: { session_id: sessionId, user: tokenUser },
      exp: Math.floor(end.getTime() / 1000)
    },
    config.jwtSecret,
    { algorithm: 'HS256' }
  )
}

async function deleteGeneratedSessions() {
  const ids = createdSessions.splice(0).map(toBin)
  if (ids.length > 0) {
    await dbWrite()('active_sessions').whereIn('id', ids).delete()
  }
}

// Every supertest request comes from the same IP: clear the login counter so
// one file does not spend the limit of the next.
async function resetLoginRateLimit() {
  const client = await getClient()
  const keys = await client.keys('rl:auth:*')
  if (keys.length > 0) {
    await client.del(keys)
  }
}

module.exports = { deleteGeneratedSessions, generateToken, resetLoginRateLimit }
