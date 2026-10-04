import { randomBytes } from 'crypto'
import type { ModeConfig } from './simulation-state.service'

type MessagePart = { type?: unknown; text?: unknown }

export type ChatMessage = {
  role: string
  content?: string | MessagePart[] | null
}

type SimulatedError = { type: string; code: string; message: string }

const FENCE = '```'
const DEFAULT_CONTENT = 'Resposta simulada.'
const DEFAULT_JSON =
  '{"category": "billing", "reason": "Cobrança duplicada na assinatura."}'
const DEFAULT_INVALID_JSON =
  'Categoria: billing. Motivo: cobrança duplicada na assinatura.'

const SIMULATED_ERRORS: Record<number, SimulatedError> = {
  400: {
    type: 'invalid_request_error',
    code: 'unsupported_parameter',
    message:
      'Unsupported parameter: this parameter is not supported with this model.'
  },
  401: {
    type: 'invalid_request_error',
    code: 'invalid_api_key',
    message: 'Incorrect API key provided.'
  },
  403: {
    type: 'request_forbidden',
    code: 'unsupported_country_region_territory',
    message: 'Country, region, or territory not supported.'
  },
  404: {
    type: 'invalid_request_error',
    code: 'model_not_found',
    message: 'The model does not exist or you do not have access to it.'
  },
  429: {
    type: 'requests',
    code: 'rate_limit_exceeded',
    message: 'Rate limit reached for requests.'
  },
  500: {
    type: 'server_error',
    code: 'server_error',
    message: 'The server had an error while processing your request.'
  },
  502: { type: 'server_error', code: 'bad_gateway', message: 'Bad gateway.' },
  503: {
    type: 'server_error',
    code: 'service_unavailable',
    message: 'The engine is currently overloaded, please try again later.'
  }
}

export const SIMULATED_ERROR_STATUSES =
  Object.keys(SIMULATED_ERRORS).map(Number)

const charactersOf = (text: string): string[] => Array.from(text)

export const countTokens = (text: string): number =>
  Math.ceil(charactersOf(text).length / 4)

const textOf = (content: ChatMessage['content']): string => {
  if (typeof content === 'string') {
    return content
  }
  if (!Array.isArray(content)) {
    return ''
  }
  return content
    .map(part =>
      part?.type === 'text' && typeof part.text === 'string' ? part.text : ''
    )
    .join('')
}

export const promptText = (messages: ChatMessage[]): string =>
  messages.map(message => textOf(message.content)).join('')

export const responseContent = (
  config: Exclude<ModeConfig, { mode: 'error' } | { mode: 'timeout' }>
): string => {
  if (config.mode === 'fenced-json') {
    return `${FENCE}json\n${config.content ?? DEFAULT_JSON}\n${FENCE}`
  }
  if (config.mode === 'invalid-json') {
    return config.content ?? DEFAULT_INVALID_JSON
  }
  return config.content ?? DEFAULT_CONTENT
}

export const simulatedError = (status: number): SimulatedError =>
  SIMULATED_ERRORS[status]

type CompletionInput = {
  model: string
  messages: ChatMessage[]
  content: string
  limit: number | null
  now?: Date
}

export const buildCompletion = ({
  model,
  messages,
  content,
  limit,
  now = new Date()
}: CompletionInput) => {
  const characters = charactersOf(content)
  const cut = limit !== null && Math.ceil(characters.length / 4) > limit
  const answer = cut ? characters.slice(0, limit * 4).join('') : content
  const promptTokens = countTokens(promptText(messages))
  const completionTokens = countTokens(answer)
  return {
    id: `chatcmpl-sim-${randomBytes(16).toString('hex')}`,
    object: 'chat.completion',
    created: Math.floor(now.getTime() / 1000),
    model,
    choices: [
      {
        index: 0,
        message: { role: 'assistant', content: answer },
        finish_reason: cut ? 'length' : 'stop'
      }
    ],
    usage: {
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      total_tokens: promptTokens + completionTokens
    }
  }
}
