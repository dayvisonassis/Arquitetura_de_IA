import { readFileSync } from 'fs'
import path from 'path'
import Joi from 'joi'
import { catalogFile } from './env'

type Env = Record<string, string | undefined>
type Item = Record<string, unknown>

type ContractField = {
  name: string
  type: 'string' | 'number' | 'boolean'
  allowed?: Array<string | number | boolean>
}

export type Deployment = {
  name: string
  provider: 'openai' | 'gemini' | 'simulated'
  model: string
  credential_env?: string
  params: string[]
  param_mappings: Record<string, string>
  fixed_params: { reasoning_effort?: string }
  price_per_million_tokens: { input: number; output: number }
}

export type Capability = {
  name: string
  type: 'chat'
  description: string
  primary: string
  fallback: string | null
  timeout_seconds: number
  max_retries: number
  max_tokens: number
  json_mode: boolean
  contract: { format: 'json'; fields: ContractField[] } | null
}

export type Catalog = {
  deployments: Deployment[]
  capabilities: Capability[]
}

const KEBAB_CASE = /^[a-z0-9]+(-[a-z0-9]+)*$/
const ENV_NAME = /^[A-Z][A-Z0-9_]*$/
const ACCEPTED_PARAMS = [
  'max_tokens',
  'temperature',
  'top_p',
  'stop',
  'response_format'
]
const REASONING_EFFORTS = ['none', 'minimal', 'low', 'medium', 'high']
const GENERIC_TERMS = new Set([
  'model',
  'models',
  'modelo',
  'modelos',
  'capability',
  'capacidade',
  'llm',
  'ai',
  'ia',
  'chat',
  'default',
  'padrao',
  'test',
  'teste',
  'assistant',
  'assistente'
])
const PROVIDER_TERMS = [
  'openai',
  'gpt',
  'gemini',
  'google',
  'claude',
  'anthropic',
  'simulated'
]

const price = Joi.number().min(0).max(1000).required()

const allowedValues = (item: Joi.Schema) =>
  Joi.array().items(item).min(1).max(50).unique()

const contractFieldSchema = Joi.object({
  name: Joi.string()
    .max(60)
    .pattern(/^[A-Za-z_][A-Za-z0-9_]*$/)
    .required(),
  type: Joi.string().valid('string', 'number', 'boolean').required(),
  allowed: Joi.when('type', {
    switch: [
      { is: 'number', then: allowedValues(Joi.number()) },
      { is: 'boolean', then: allowedValues(Joi.boolean()) }
    ],
    otherwise: allowedValues(Joi.string())
  })
})

const deploymentSchema = Joi.object({
  name: Joi.string().required(),
  provider: Joi.string().valid('openai', 'gemini', 'simulated').required(),
  model: Joi.string()
    .max(100)
    .pattern(/^[A-Za-z0-9._:/-]+$/)
    .required(),
  credential_env: Joi.string()
    .pattern(ENV_NAME)
    .messages({
      'string.pattern.base':
        'must be an environment variable name (uppercase letters, digits and underscore)'
    })
    .when('provider', {
      is: 'simulated',
      then: Joi.optional(),
      otherwise: Joi.required()
    }),
  params: Joi.array()
    .items(Joi.string().valid(...ACCEPTED_PARAMS))
    .unique()
    .required(),
  param_mappings: Joi.object()
    .pattern(
      Joi.string(),
      Joi.string()
        .max(60)
        .pattern(/^[a-z][a-z0-9_]*$/)
    )
    .default({}),
  fixed_params: Joi.object({
    reasoning_effort: Joi.string().valid(...REASONING_EFFORTS)
  }).default({}),
  price_per_million_tokens: Joi.object({
    input: price,
    output: price
  }).required()
})

const capabilitySchema = Joi.object({
  name: Joi.string().required(),
  type: Joi.string().valid('chat').required(),
  description: Joi.string().max(200).required(),
  primary: Joi.string().required(),
  fallback: Joi.string().allow(null).default(null),
  timeout_seconds: Joi.number().integer().min(1).max(120).required(),
  max_retries: Joi.number().integer().min(0).max(3).required(),
  max_tokens: Joi.number().integer().min(1).max(8192).required(),
  json_mode: Joi.boolean().required(),
  contract: Joi.object({
    format: Joi.string().valid('json').required(),
    fields: Joi.array()
      .items(contractFieldSchema)
      .min(1)
      .max(20)
      .unique('name')
      .required()
  })
    .allow(null)
    .default(null)
})

const catalogSchema = Joi.object({
  deployments: Joi.array().items(deploymentSchema).min(1).required(),
  capabilities: Joi.array().items(capabilitySchema).min(1).required()
}).required()

export class CatalogError extends Error {
  readonly problems: string[]

  constructor(problems: string[]) {
    super(problems.map(problem => `Invalid catalog: ${problem}`).join('\n'))
    this.name = 'CatalogError'
    this.problems = problems
  }
}

const isItem = (value: unknown): value is Item =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const itemsOf = (catalog: unknown, key: string): Item[] => {
  const items = isItem(catalog) ? catalog[key] : undefined
  return Array.isArray(items) ? items.filter(isItem) : []
}

const textOf = (item: Item, key: string): string | undefined => {
  const value = item[key]
  return typeof value === 'string' ? value : undefined
}

const isKebabCase = (name: string, min: number, max: number): boolean =>
  KEBAB_CASE.test(name) && name.length >= min && name.length <= max

const formatPath = (keys: Array<string | number>): string =>
  keys.length === 0
    ? 'catalog'
    : keys
        .map((key, index) => {
          if (typeof key === 'number') {
            return `[${key}]`
          }
          return index === 0 ? key : `.${key}`
        })
        .join('')

const duplicatesOf = (names: string[]): string[] => [
  ...new Set(names.filter((name, index) => names.indexOf(name) !== index))
]

const namesOf = (items: Item[]): string[] =>
  items
    .map(item => textOf(item, 'name'))
    .filter((name): name is string => name !== undefined)

const capabilityNameProblems = (name: string, index: number): string[] => {
  if (!isKebabCase(name, 3, 40)) {
    return [
      `capabilities[${index}].name '${name}' must be kebab-case with 3 to 40 characters`
    ]
  }
  const parts = name.split('-')
  const provider = PROVIDER_TERMS.find(term =>
    parts.some(part => part.startsWith(term))
  )
  if (provider) {
    return [
      `capability '${name}' must not name a provider or model family ('${provider}')`
    ]
  }
  if (parts.every(part => /^\d+$/.test(part) || GENERIC_TERMS.has(part))) {
    return [
      `capability '${name}' has a generic name; describe its expected use`
    ]
  }
  return []
}

const deploymentProblems = (deployment: Item, env: Env): string[] => {
  const name = textOf(deployment, 'name') ?? '?'
  const problems: string[] = []
  const params = Array.isArray(deployment.params) ? deployment.params : []
  if (Array.isArray(deployment.params) && !params.includes('max_tokens')) {
    problems.push(`deployment '${name}' must accept max_tokens`)
  }
  const mappings = isItem(deployment.param_mappings)
    ? deployment.param_mappings
    : {}
  for (const key of Object.keys(mappings)) {
    if (!params.includes(key)) {
      problems.push(
        `deployment '${name}' maps '${key}', which is not in its params`
      )
    }
  }
  const credential = textOf(deployment, 'credential_env')
  if (credential && ENV_NAME.test(credential) && !env[credential]) {
    problems.push(
      `deployment '${name}' references ${credential}, which is missing or empty in the environment`
    )
  }
  return problems
}

const referenceProblems = (
  capability: Item,
  deployments: Set<string>
): string[] => {
  const name = textOf(capability, 'name') ?? '?'
  const primary = textOf(capability, 'primary')
  const fallback = textOf(capability, 'fallback')
  const problems: string[] = []
  if (primary !== undefined && !deployments.has(primary)) {
    problems.push(
      `capability '${name}' points to primary '${primary}', which does not exist`
    )
  }
  if (fallback !== undefined && !deployments.has(fallback)) {
    problems.push(
      `capability '${name}' points to fallback '${fallback}', which does not exist`
    )
  }
  if (fallback !== undefined && fallback === primary) {
    problems.push(
      `capability '${name}' uses '${fallback}' as both primary and fallback`
    )
  }
  return problems
}

const crossCheck = (catalog: unknown, env: Env): string[] => {
  const deployments = itemsOf(catalog, 'deployments')
  const capabilities = itemsOf(catalog, 'capabilities')
  const deploymentNames = namesOf(deployments)
  const capabilityNames = namesOf(capabilities)
  const known = new Set(deploymentNames)
  return [
    ...deployments.flatMap((deployment, index) => {
      const name = textOf(deployment, 'name')
      return name !== undefined && !isKebabCase(name, 3, 60)
        ? [
            `deployments[${index}].name '${name}' must be kebab-case with 3 to 60 characters`
          ]
        : []
    }),
    ...duplicatesOf(deploymentNames).map(
      name => `deployment '${name}' is declared more than once`
    ),
    ...deployments.flatMap(deployment => deploymentProblems(deployment, env)),
    ...capabilities.flatMap((capability, index) => {
      const name = textOf(capability, 'name')
      return name === undefined ? [] : capabilityNameProblems(name, index)
    }),
    ...duplicatesOf(capabilityNames).map(
      name => `capability '${name}' is declared more than once`
    ),
    ...capabilities.flatMap(capability => referenceProblems(capability, known))
  ]
}

const deepFreeze = <T>(value: T): T => {
  if (typeof value === 'object' && value !== null) {
    Object.values(value).forEach(deepFreeze)
    Object.freeze(value)
  }
  return value
}

const readCatalogFile = (file: string): unknown => {
  let content: string
  try {
    content = readFileSync(path.resolve(process.cwd(), file), 'utf8')
  } catch {
    throw new CatalogError([`cannot read ${file}`])
  }
  try {
    return JSON.parse(content)
  } catch {
    throw new CatalogError([`${file} is not valid JSON`])
  }
}

const loadCatalog = (env: Env): Catalog => {
  const { value, error } = catalogSchema.validate(
    readCatalogFile(catalogFile(env)),
    { abortEarly: false, convert: false, errors: { label: false } }
  )
  const problems = [
    ...(error?.details ?? []).map(
      detail => `${formatPath(detail.path)} ${detail.message}`
    ),
    ...crossCheck(value, env)
  ]
  if (problems.length > 0) {
    throw new CatalogError(problems)
  }
  return deepFreeze(value as Catalog)
}

export const assertCatalog = (env: Env = process.env): void => {
  loadCatalog(env)
}

let cached: Catalog | null = null

export const getCatalog = (): Catalog => {
  if (!cached) {
    cached = loadCatalog(process.env)
  }
  return cached
}
