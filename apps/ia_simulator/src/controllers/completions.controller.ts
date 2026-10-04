import type { NextFunction, Request, Response } from 'express'
import Joi from 'joi'
import { sendApiError } from '../lib/api-error'
import { wait } from '../lib/wait'
import logger from '../logger'
import {
  buildCompletion,
  responseContent,
  simulatedError,
  type ChatMessage
} from '../services/completion.service'
import { recordCall, takeMode } from '../services/simulation-state.service'

type CompletionBody = {
  model: string
  messages: ChatMessage[]
  max_completion_tokens?: number | null
  max_tokens?: number | null
}

const tokenLimit = Joi.number().integer().min(1).allow(null)

const bodySchema = Joi.object({
  model: Joi.string().min(1).max(200).required(),
  messages: Joi.array()
    .items(
      Joi.object({
        role: Joi.string().required(),
        content: Joi.alternatives()
          .try(Joi.string().allow(''), Joi.array())
          .allow(null)
      }).unknown(true)
    )
    .min(1)
    .max(1000)
    .required(),
  max_completion_tokens: tokenLimit,
  max_tokens: tokenLimit
}).unknown(true)

const invalidRequestMessage = (detail: Joi.ValidationErrorItem): string => {
  const field = detail.path.join('.')
  if (!field) {
    return 'The request body must be a JSON object.'
  }
  switch (detail.type) {
    case 'any.required':
      return `The field '${field}' is required.`
    case 'array.min':
      return `The field '${field}' must have at least 1 item.`
    case 'array.max':
      return `The field '${field}' must have at most 1000 items.`
    case 'number.base':
    case 'number.integer':
    case 'number.min':
      return `The field '${field}' must be an integer of at least 1.`
    default:
      return `The field '${field}' is invalid.`
  }
}

const sendCompletion = (
  res: Response,
  body: CompletionBody,
  content: string
): void => {
  res.status(200).json(
    buildCompletion({
      model: body.model,
      messages: body.messages,
      content,
      limit: body.max_completion_tokens ?? body.max_tokens ?? null
    })
  )
}

const clientGone = (res: Response): AbortController => {
  const controller = new AbortController()
  res.once('close', () => controller.abort())
  return controller
}

export const createCompletion = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { value, error } = bodySchema.validate(req.body, {
      convert: false
    })
    if (error) {
      sendApiError(
        res,
        400,
        'invalid_request',
        invalidRequestMessage(error.details[0])
      )
      return
    }
    const body = value as CompletionBody
    const config = takeMode(body.model)
    recordCall(body.model, config.mode, req.body)
    logger.info(
      {
        model: body.model,
        mode: config.mode,
        status: config.mode === 'error' ? config.status : undefined,
        delay_ms: config.mode === 'slow' ? config.delay_ms : undefined
      },
      'Simulated completion'
    )
    if (config.mode === 'timeout') {
      return
    }
    if (config.mode === 'error') {
      const { type, code, message } = simulatedError(config.status)
      if (config.retry_after_seconds !== undefined) {
        res.setHeader('Retry-After', String(config.retry_after_seconds))
      }
      sendApiError(res, config.status, code, message, type)
      return
    }
    if (config.mode === 'slow') {
      const client = clientGone(res)
      await wait(config.delay_ms, client.signal)
      if (client.signal.aborted) {
        return
      }
    }
    sendCompletion(res, body, responseContent(config))
  } catch (error) {
    next(error)
  }
}
