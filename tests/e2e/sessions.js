const fs = require('fs')
const path = require('path')

const PROFILES = ['admin', 'user']
const AUTH_DIR = path.join(__dirname, '.auth')
const BASE_URL = process.env.E2E_BASE_URL || 'http://127.0.0.1:4200'
const API_URL = process.env.E2E_API_URL || 'http://127.0.0.1:3030'
const EXPIRY_MARGIN_MS = 5 * 60 * 1000

const storageStatePath = profile => path.join(AUTH_DIR, `${profile}.json`)

function readToken(profile) {
  const file = storageStatePath(profile)
  if (!fs.existsSync(file)) {
    return null
  }
  const state = JSON.parse(fs.readFileSync(file, 'utf8'))
  const origin = (state.origins || []).find(
    entry => entry.origin === new URL(BASE_URL).origin
  )
  const currentUser = origin?.localStorage.find(
    item => item.name === 'currentUser'
  )
  if (!currentUser) {
    return null
  }
  try {
    return JSON.parse(currentUser.value).token || null
  } catch {
    return null
  }
}

function expiresAt(token) {
  try {
    const payload = token.split('.')[1]
    return (
      JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')).exp * 1000
    )
  } catch {
    return 0
  }
}

function sessionIsValid(profile) {
  const token = readToken(profile)
  return Boolean(token) && expiresAt(token) - EXPIRY_MARGIN_MS > Date.now()
}

module.exports = {
  API_URL,
  AUTH_DIR,
  BASE_URL,
  PROFILES,
  readToken,
  sessionIsValid,
  storageStatePath
}
