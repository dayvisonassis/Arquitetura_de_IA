require('../../loader')
const { RULE_MESSAGES, validatePassword } = require('../utils/password.utils')
const { isValidEmail } = require('../utils/email.utils')

const LOGIN_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000

const LOG_LEVELS = [
  'fatal',
  'error',
  'warn',
  'info',
  'debug',
  'trace',
  'silent'
]

const read = (env, name) => {
  const value = env[name]
  return value === undefined || value === '' ? undefined : value
}

const isInteger = (value, min, max) =>
  /^\d+$/.test(value) && Number(value) >= min && Number(value) <= max

const isHttpUrl = value => {
  try {
    return ['http:', 'https:'].includes(new URL(value).protocol)
  } catch {
    return false
  }
}

const required = check => value => value !== undefined && check(value)
const optional = check => value => value === undefined || check(value)
const present = () => true

const emailReason = value =>
  isValidEmail(value) ? null : 'must be a valid e-mail up to 254 characters'

const passwordReason = value => {
  const { valid, rule } = validatePassword(value)
  return valid ? null : RULE_MESSAGES[rule]
}

const REASONS = {
  PLATFORM_ADMIN_EMAIL: emailReason,
  PLATFORM_ADMIN_PASSWORD: passwordReason
}

const RULES = [
  ['PORT', optional(value => isInteger(value, 1, 65535))],
  ['FRONTEND_ORIGIN', optional(isHttpUrl)],
  ['DB_HOST', required(present)],
  ['DB_PORT', optional(value => isInteger(value, 1, 65535))],
  ['DB_USER', required(present)],
  ['DB_PASSWORD', required(present)],
  ['DB_NAME', required(present)],
  ['REDIS_HOST', required(present)],
  ['REDIS_PORT', optional(value => isInteger(value, 1, 65535))],
  ['REDIS_PASSWORD', required(present)],
  ['REDIS_DB', required(value => isInteger(value, 0, 15))],
  ['GATEWAY_URL', required(isHttpUrl)],
  [
    'GATEWAY_TIMEOUT_MS',
    optional(value => isInteger(value, 1, Number.MAX_SAFE_INTEGER))
  ],
  ['GATEWAY_MASTER_KEY', required(value => value.length >= 32)],
  ['JWT_SECRET', required(value => value.length >= 32)],
  ['KEY_ENCRYPTION_KEY', required(value => /^[0-9a-fA-F]{64}$/.test(value))],
  ['PLATFORM_ADMIN_EMAIL', required(value => !emailReason(value))],
  ['PLATFORM_ADMIN_PASSWORD', required(value => !passwordReason(value))],
  ['LOGIN_RATE_LIMIT_MAX', optional(value => isInteger(value, 1, 10000))],
  ['LOG_LEVEL', optional(value => LOG_LEVELS.includes(value))]
]

const buildConfig = env => {
  const value = name => read(env, name)
  const logLevel = value('LOG_LEVEL')
  return Object.freeze({
    nodeEnv: value('NODE_ENV') ?? 'development',
    port: Number(value('PORT') ?? 3030),
    apiHost: value('API_HOST') ?? '127.0.0.1',
    frontendOrigin: value('FRONTEND_ORIGIN') ?? 'http://127.0.0.1:4200',
    logLevel: LOG_LEVELS.includes(logLevel) ? logLevel : 'info',
    db: Object.freeze({
      host: value('DB_HOST'),
      port: Number(value('DB_PORT') ?? 3306),
      user: value('DB_USER'),
      password: value('DB_PASSWORD'),
      database: value('DB_NAME')
    }),
    redis: Object.freeze({
      host: value('REDIS_HOST'),
      port: Number(value('REDIS_PORT') ?? 6379),
      password: value('REDIS_PASSWORD'),
      db: Number(value('REDIS_DB') ?? 0)
    }),
    gateway: Object.freeze({
      url: value('GATEWAY_URL'),
      timeoutMs: Number(value('GATEWAY_TIMEOUT_MS') ?? 10000),
      masterKey: value('GATEWAY_MASTER_KEY')
    }),
    jwtSecret: value('JWT_SECRET'),
    keyEncryptionKey: value('KEY_ENCRYPTION_KEY'),
    platformAdmin: Object.freeze({
      email: value('PLATFORM_ADMIN_EMAIL'),
      password: value('PLATFORM_ADMIN_PASSWORD')
    }),
    loginRateLimit: Object.freeze({
      max: Number(value('LOGIN_RATE_LIMIT_MAX') ?? 20),
      windowMs: LOGIN_RATE_LIMIT_WINDOW_MS
    })
  })
}

class ConfigError extends Error {
  constructor(variable, reason) {
    const detail = reason ? ` (${reason})` : ''
    super(`Missing or invalid environment variable: ${variable}${detail}`)
    this.name = 'ConfigError'
    this.variable = variable
    this.reason = reason ?? null
  }
}

const assertConfig = (env = process.env) => {
  const invalid = RULES.find(([name, isValid]) => !isValid(read(env, name)))
  if (invalid) {
    const [name] = invalid
    const current = read(env, name)
    const reason =
      current !== undefined && REASONS[name] ? REASONS[name](current) : null
    throw new ConfigError(name, reason)
  }
}

const config = buildConfig(process.env)

module.exports = { assertConfig, config }
