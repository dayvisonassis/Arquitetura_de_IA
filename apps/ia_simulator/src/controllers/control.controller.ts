import type { Request, Response } from 'express'
import Joi from 'joi'
import { sendApiError } from '../lib/api-error'
import logger from '../logger'
import { SIMULATED_ERROR_STATUSES } from '../services/completion.service'
import {
  getStats,
  listModes,
  MODES,
  reset,
  setMode,
  type ModeName,
  type ModeRequest
} from '../services/simulation-state.service'

type Field =
  | 'model'
  | 'times'
  | 'content'
  | 'status'
  | 'retry_after_seconds'
  | 'delay_ms'

const RETRY_AFTER_STATUSES = [429, 503]

const FIELD_RULES: Record<Field, string> = {
  model: "The field 'model' must be a string from 1 to 200 characters.",
  times: "The field 'times' must be an integer from 1 to 1000.",
  content: "The field 'content' must be a string from 1 to 20000 characters.",
  status: `The field 'status' must be one of ${SIMULATED_ERROR_STATUSES.join(', ')}.`,
  retry_after_seconds:
    "The field 'retry_after_seconds' must be an integer from 0 to 120.",
  delay_ms: "The field 'delay_ms' must be an integer from 0 to 120000."
}

const base = (mode: ModeName) => ({
  model: Joi.string().min(1).max(200).required(),
  mode: Joi.string().valid(mode).required(),
  times: Joi.number().integer().min(1).max(1000)
})

const content = Joi.string().min(1).max(20000)

const SCHEMAS: Record<ModeName, Joi.ObjectSchema> = {
  ok: Joi.object({ ...base('ok'), content }),
  error: Joi.object({
    ...base('error'),
    status: Joi.number()
      .valid(...SIMULATED_ERROR_STATUSES)
      .required(),
    retry_after_seconds: Joi.number().integer().min(0).max(120)
  }),
  slow: Joi.object({
    ...base('slow'),
    delay_ms: Joi.number().integer().min(0).max(120000).required(),
    content
  }),
  timeout: Joi.object(base('timeout')),
  'fenced-json': Joi.object({ ...base('fenced-json'), content }),
  'invalid-json': Joi.object({ ...base('invalid-json'), content })
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const isModeName = (value: unknown): value is ModeName =>
  MODES.some(mode => mode === value)

const isJson = (text: string): boolean => {
  try {
    JSON.parse(text)
    return true
  } catch {
    return false
  }
}

const invalidModeMessage = (
  mode: ModeName,
  detail: Joi.ValidationErrorItem
): string => {
  const field = String(detail.path[0])
  if (detail.type === 'object.unknown') {
    return `The field '${field}' is not accepted in ${mode} mode.`
  }
  if (detail.type === 'any.required') {
    return `The field '${field}' is required.`
  }
  return FIELD_RULES[field as Field]
}

const ruleMessage = (request: ModeRequest): string | null => {
  if (
    request.mode === 'error' &&
    request.retry_after_seconds !== undefined &&
    !RETRY_AFTER_STATUSES.includes(request.status)
  ) {
    return "The field 'retry_after_seconds' is only accepted with status 429 or 503."
  }
  if (
    request.mode === 'fenced-json' &&
    request.content !== undefined &&
    !isJson(request.content)
  ) {
    return "The field 'content' must be valid JSON in fenced-json mode."
  }
  if (
    request.mode === 'invalid-json' &&
    request.content !== undefined &&
    isJson(request.content)
  ) {
    return "The field 'content' must not be valid JSON in invalid-json mode."
  }
  return null
}

const sendInvalid = (res: Response, message: string): void => {
  sendApiError(res, 400, 'invalid_value', message)
}

export const setModeHandler = (req: Request, res: Response): void => {
  const body: unknown = req.body
  if (!isObject(body)) {
    sendInvalid(res, 'The request body must be a JSON object.')
    return
  }
  if (body.mode === undefined) {
    sendInvalid(res, "The field 'mode' is required.")
    return
  }
  if (!isModeName(body.mode)) {
    sendInvalid(res, `The field 'mode' must be one of ${MODES.join(', ')}.`)
    return
  }
  const { value, error } = SCHEMAS[body.mode].validate(body, {
    convert: false
  })
  if (error) {
    sendInvalid(res, invalidModeMessage(body.mode, error.details[0]))
    return
  }
  const request = value as ModeRequest
  const broken = ruleMessage(request)
  if (broken) {
    sendInvalid(res, broken)
    return
  }
  const stored = setMode(request)
  logger.info({ model: stored.model, mode: stored.mode }, 'Simulation mode set')
  res.status(200).json(stored)
}

export const getModes = (_req: Request, res: Response): void => {
  res.status(200).json({ modes: listModes() })
}

export const getStatsHandler = (_req: Request, res: Response): void => {
  res.status(200).json({ models: getStats() })
}

export const resetHandler = (_req: Request, res: Response): void => {
  reset()
  logger.info('Simulation reset')
  res.status(204).end()
}
