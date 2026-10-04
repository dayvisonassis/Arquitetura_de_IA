import '../../loader'

type Env = Record<string, string | undefined>
type Rule = [name: string, isValid: (value: string | undefined) => boolean]

const LOG_LEVELS = [
  'fatal',
  'error',
  'warn',
  'info',
  'debug',
  'trace',
  'silent'
]

const read = (env: Env, name: string): string | undefined => {
  const value = env[name]
  return value === undefined || value === '' ? undefined : value
}

const isInteger = (value: string, min: number, max: number): boolean =>
  /^\d+$/.test(value) && Number(value) >= min && Number(value) <= max

const required =
  (check: (value: string) => boolean) =>
  (value: string | undefined): boolean =>
    value !== undefined && check(value)

const optional =
  (check: (value: string) => boolean) =>
  (value: string | undefined): boolean =>
    value === undefined || check(value)

const present = (): boolean => true
const isPort = (value: string): boolean => isInteger(value, 1, 65535)

const RULES: Rule[] = [
  ['PORT', optional(isPort)],
  ['DB_HOST', required(present)],
  ['DB_PORT', optional(isPort)],
  ['DB_USER', required(present)],
  ['DB_PASSWORD', required(present)],
  ['DB_NAME', required(present)],
  ['REDIS_HOST', required(present)],
  ['REDIS_PORT', optional(isPort)],
  ['REDIS_PASSWORD', required(present)],
  ['REDIS_DB', required(value => isInteger(value, 0, 15))],
  ['GATEWAY_MASTER_KEY', required(value => value.length >= 32)],
  ['OPENAI_API_KEY', required(present)],
  ['GEMINI_API_KEY', required(present)],
  ['LOG_LEVEL', optional(value => LOG_LEVELS.includes(value))],
  ['CATALOG_FILE', optional(present)]
]

const DEFAULT_CATALOG_FILE = 'catalog/catalog.json'

export const catalogFile = (env: Env = process.env): string =>
  read(env, 'CATALOG_FILE') ?? DEFAULT_CATALOG_FILE

const buildConfig = (env: Env) => {
  const value = (name: string) => read(env, name)
  const logLevel = value('LOG_LEVEL')
  return Object.freeze({
    nodeEnv: value('NODE_ENV') ?? 'development',
    port: Number(value('PORT') ?? 3131),
    apiHost: value('API_HOST') ?? '127.0.0.1',
    logLevel: logLevel && LOG_LEVELS.includes(logLevel) ? logLevel : 'info',
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
    masterKey: value('GATEWAY_MASTER_KEY'),
    providers: Object.freeze({
      openaiApiKey: value('OPENAI_API_KEY'),
      geminiApiKey: value('GEMINI_API_KEY')
    })
  })
}

export class ConfigError extends Error {
  readonly variable: string

  constructor(variable: string) {
    super(`Missing or invalid environment variable: ${variable}`)
    this.name = 'ConfigError'
    this.variable = variable
  }
}

export const assertConfig = (env: Env = process.env): void => {
  const invalid = RULES.find(([name, isValid]) => !isValid(read(env, name)))
  if (invalid) {
    throw new ConfigError(invalid[0])
  }
}

export const config = buildConfig(process.env)
