require('../../loader')

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
  ['PLATFORM_ADMIN_EMAIL', required(present)],
  ['PLATFORM_ADMIN_PASSWORD', required(present)],
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
    })
  })
}

class ConfigError extends Error {
  constructor(variable) {
    super(`Missing or invalid environment variable: ${variable}`)
    this.name = 'ConfigError'
    this.variable = variable
  }
}

const assertConfig = (env = process.env) => {
  const invalid = RULES.find(([name, isValid]) => !isValid(read(env, name)))
  if (invalid) {
    throw new ConfigError(invalid[0])
  }
}

const config = buildConfig(process.env)

module.exports = { assertConfig, config }
