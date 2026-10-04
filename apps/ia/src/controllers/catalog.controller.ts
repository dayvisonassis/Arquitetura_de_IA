import type { NextFunction, Request, Response } from 'express'
import Joi from 'joi'
import {
  getCatalog,
  type Capability,
  type Catalog,
  type Deployment
} from '../config/catalog'
import { sendApiError } from '../lib/api-error'
import logger from '../logger'
import {
  CatalogInvalidStateError,
  CatalogStateUnavailableError,
  getCatalogState,
  resumeResource,
  suspendResource,
  unavailableCapabilities,
  type CatalogState,
  type ResourceType,
  type Suspension
} from '../services/catalog-state.service'

type Handler = (
  req: Request,
  res: Response,
  next: NextFunction
) => Promise<void>

type Body = { reason?: string; actor: string }

const MESSAGES: Record<
  ResourceType,
  Record<'missing' | 'suspended' | 'active', (name: string) => string>
> = {
  capability: {
    missing: name => `A capacidade '${name}' não existe no catálogo.`,
    suspended: name => `A capacidade '${name}' já está suspensa.`,
    active: name => `A capacidade '${name}' não está suspensa.`
  },
  deployment: {
    missing: name => `O deployment '${name}' não existe no catálogo.`,
    suspended: name => `O deployment '${name}' já está suspenso.`,
    active: name => `O deployment '${name}' não está suspenso.`
  }
}

const STATE_UNAVAILABLE =
  'O estado do catálogo está temporariamente indisponível.'
const NOTHING_CHANGED = `${STATE_UNAVAILABLE} Nada foi alterado.`
const UNCONFIRMED =
  'Não foi possível confirmar a operação. Confira o estado do catálogo antes de repetir.'

const actor = Joi.string()
  .email({ tlds: { allow: false } })
  .max(254)
  .required()

const BODIES = {
  suspend: Joi.object({
    reason: Joi.string().trim().min(1).max(200).required(),
    actor
  }),
  resume: Joi.object({
    reason: Joi.string().trim().max(200).allow(''),
    actor
  })
}

const REASON_MESSAGES = {
  suspend: "O campo 'reason' é obrigatório e aceita até 200 caracteres.",
  resume: "O campo 'reason' aceita até 200 caracteres."
}

const capabilityView = (capability: Capability, state: CatalogState) => ({
  name: capability.name,
  type: capability.type,
  description: capability.description,
  primary: capability.primary,
  fallback: capability.fallback,
  timeout_seconds: capability.timeout_seconds,
  max_retries: capability.max_retries,
  max_tokens: capability.max_tokens,
  json_mode: capability.json_mode,
  contract: capability.contract,
  ...state.capabilities[capability.name]
})

const deploymentView = (deployment: Deployment, state: CatalogState) => ({
  name: deployment.name,
  provider: deployment.provider,
  model: deployment.model,
  params: deployment.params,
  param_mappings: deployment.param_mappings,
  fixed_params: deployment.fixed_params,
  price_per_million_tokens: deployment.price_per_million_tokens,
  ...state.deployments[deployment.name]
})

const exists = (catalog: Catalog, type: ResourceType, name: string): boolean =>
  type === 'capability'
    ? catalog.capabilities.some(item => item.name === name)
    : catalog.deployments.some(item => item.name === name)

const invalidBodyMessage = (
  action: 'suspend' | 'resume',
  detail: Joi.ValidationErrorItem
): string => {
  if (detail.type === 'object.unknown') {
    return `O campo '${String(detail.context?.key)}' não é aceito.`
  }
  if (detail.path[0] === 'reason') {
    return REASON_MESSAGES[action]
  }
  if (detail.path[0] === 'actor') {
    return "O campo 'actor' precisa ser um e-mail."
  }
  return 'O corpo da requisição precisa ser um objeto JSON.'
}

const sendStateError = (
  res: Response,
  next: NextFunction,
  error: unknown,
  type: ResourceType,
  name: string
): void => {
  if (error instanceof CatalogInvalidStateError) {
    const message = error.suspended ? 'suspended' : 'active'
    sendApiError(res, 409, 'invalid_state', MESSAGES[type][message](name))
    return
  }
  if (error instanceof CatalogStateUnavailableError) {
    sendApiError(
      res,
      503,
      'catalog_state_unavailable',
      error.unconfirmed ? UNCONFIRMED : NOTHING_CHANGED
    )
    return
  }
  next(error)
}

const applyChange = (
  state: CatalogState,
  type: ResourceType,
  name: string,
  suspension: Suspension | null
): void => {
  if (type === 'capability') {
    state.capabilities[name] = {
      state: suspension ? 'suspended' : 'active',
      suspension
    }
    return
  }
  const { cooldown_until: cooldownUntil } = state.deployments[name]
  let nextState: CatalogState['deployments'][string]['state'] = 'active'
  if (suspension) {
    nextState = 'suspended'
  } else if (cooldownUntil) {
    nextState = 'cooldown'
  }
  state.deployments[name] = {
    state: nextState,
    suspension,
    cooldown_until: cooldownUntil
  }
}

const resourceResponse = (
  catalog: Catalog,
  state: CatalogState,
  type: ResourceType,
  name: string,
  warnings: string[]
) =>
  type === 'capability'
    ? {
        capability: capabilityView(
          catalog.capabilities.find(item => item.name === name) as Capability,
          state
        ),
        warnings
      }
    : {
        deployment: deploymentView(
          catalog.deployments.find(item => item.name === name) as Deployment,
          state
        ),
        warnings
      }

export const getCatalogView: Handler = async (_req, res, next) => {
  try {
    const catalog = getCatalog()
    const state = await getCatalogState()
    res.status(200).json({
      capabilities: catalog.capabilities.map(item =>
        capabilityView(item, state)
      ),
      deployments: catalog.deployments.map(item => deploymentView(item, state))
    })
  } catch (error) {
    if (error instanceof CatalogStateUnavailableError) {
      sendApiError(res, 503, 'catalog_state_unavailable', STATE_UNAVAILABLE)
      return
    }
    next(error)
  }
}

const changeState =
  (action: 'suspend' | 'resume', type: ResourceType): Handler =>
  async (req, res, next) => {
    const { name } = req.params
    try {
      const catalog = getCatalog()
      if (!exists(catalog, type, name)) {
        sendApiError(res, 404, 'not_found', MESSAGES[type].missing(name))
        return
      }
      const { value, error } = BODIES[action].validate(req.body ?? {})
      if (error) {
        sendApiError(
          res,
          400,
          'invalid_value',
          invalidBodyMessage(action, error.details[0])
        )
        return
      }
      const body = value as Body
      const state = await getCatalogState()
      let warnings: string[] = []
      if (action === 'suspend') {
        const suspension = await suspendResource(type, name, {
          reason: String(body.reason),
          actor: body.actor
        })
        applyChange(state, type, name, suspension)
        if (type === 'deployment') {
          warnings = unavailableCapabilities(catalog, state, name).map(
            capability =>
              `A capacidade '${capability}' ficará indisponível enquanto o deployment estiver suspenso.`
          )
        }
      } else {
        await resumeResource(type, name)
        applyChange(state, type, name, null)
      }
      ;(req.log ?? logger).info(
        {
          type,
          name,
          actor: body.actor,
          reason: body.reason,
          requestId: req.id
        },
        action === 'suspend'
          ? 'Catalog resource suspended'
          : 'Catalog resource resumed'
      )
      res
        .status(200)
        .json(resourceResponse(catalog, state, type, name, warnings))
    } catch (error) {
      sendStateError(res, next, error, type, name)
    }
  }

export const suspendCapability = changeState('suspend', 'capability')
export const resumeCapability = changeState('resume', 'capability')
export const suspendDeployment = changeState('suspend', 'deployment')
export const resumeDeployment = changeState('resume', 'deployment')
