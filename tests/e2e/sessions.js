const fs = require('fs')
const path = require('path')
const { parseEnv } = require('util')

const ROOT = path.join(__dirname, '..', '..')
const ENV_FILE = path.join(ROOT, '.env.e2e')

function loadEnvFile() {
  if (!fs.existsSync(ENV_FILE)) {
    return
  }
  const values = parseEnv(fs.readFileSync(ENV_FILE, 'utf8'))
  for (const [name, value] of Object.entries(values)) {
    if (process.env[name] === undefined) {
      process.env[name] = value
    }
  }
}

loadEnvFile()

const PROFILES = ['platform_admin', 'admin', 'user']
const AUTH_DIR = path.join(__dirname, '.auth')
const BASE_URL = process.env.E2E_BASE_URL || 'http://127.0.0.1:4200'
const API_URL = process.env.E2E_API_URL || 'http://127.0.0.1:3030'
const EXPIRY_MARGIN_MS = 5 * 60 * 1000

const storageStatePath = profile => path.join(AUTH_DIR, `${profile}.json`)

const envPrefix = profile => `E2E_${profile.toUpperCase()}`

function credentials(profile) {
  const prefix = envPrefix(profile)
  return {
    login: process.env[`${prefix}_LOGIN`],
    password: process.env[`${prefix}_PASSWORD`]
  }
}

function readCurrentUser(profile) {
  const file = storageStatePath(profile)
  if (!fs.existsSync(file)) {
    return null
  }
  try {
    const state = JSON.parse(fs.readFileSync(file, 'utf8'))
    const origin = (state.origins || []).find(
      entry => entry.origin === new URL(BASE_URL).origin
    )
    const item = origin?.localStorage.find(
      entry => entry.name === 'currentUser'
    )
    return item ? JSON.parse(item.value) : null
  } catch {
    return null
  }
}

function readToken(profile) {
  return readCurrentUser(profile)?.token || null
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

function tokenIsFresh(token) {
  return Boolean(token) && expiresAt(token) - EXPIRY_MARGIN_MS > Date.now()
}

function writeSession(profile, currentUser) {
  fs.mkdirSync(AUTH_DIR, { recursive: true })
  const state = {
    cookies: [],
    origins: [
      {
        origin: new URL(BASE_URL).origin,
        localStorage: [
          { name: 'currentUser', value: JSON.stringify(currentUser) }
        ]
      }
    ]
  }
  fs.writeFileSync(storageStatePath(profile), JSON.stringify(state, null, 2))
}

module.exports = {
  API_URL,
  AUTH_DIR,
  BASE_URL,
  PROFILES,
  credentials,
  envPrefix,
  readToken,
  storageStatePath,
  tokenIsFresh,
  writeSession
}
