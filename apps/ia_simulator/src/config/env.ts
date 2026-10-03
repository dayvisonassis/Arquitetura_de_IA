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

const optional =
  (check: (value: string) => boolean) =>
  (value: string | undefined): boolean =>
    value === undefined || check(value)

const RULES: Rule[] = [
  [
    'PORT',
    optional(
      value =>
        /^\d+$/.test(value) && Number(value) >= 1 && Number(value) <= 65535
    )
  ],
  ['LOG_LEVEL', optional(value => LOG_LEVELS.includes(value))]
]

const buildConfig = (env: Env) => {
  const value = (name: string) => read(env, name)
  const logLevel = value('LOG_LEVEL')
  return Object.freeze({
    nodeEnv: value('NODE_ENV') ?? 'development',
    port: Number(value('PORT') ?? 3132),
    apiHost: value('API_HOST') ?? '127.0.0.1',
    logLevel: logLevel && LOG_LEVELS.includes(logLevel) ? logLevel : 'info'
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
