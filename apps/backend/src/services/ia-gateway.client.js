export class GatewayError extends Error {
  constructor({ status, code, message, requestId }) {
    super(message)
    this.name = 'GatewayError'
    this.status = status
    this.code = code
    this.requestId = requestId
  }
}

const parseJson = text => {
  try {
    return text ? JSON.parse(text) : null
  } catch {
    return null
  }
}

export const createIaGatewayClient = ({ baseUrl, masterKey, timeoutMs }) => {
  const root = baseUrl.replace(/\/+$/, '')

  const adminRequest = async ({ method = 'GET', path, body, requestId }) => {
    const headers = { accept: 'application/json' }
    if (masterKey) {
      headers.authorization = `Bearer ${masterKey}`
    }
    if (requestId) {
      headers['x-request-id'] = requestId
    }
    if (body !== undefined) {
      headers['content-type'] = 'application/json'
    }
    let response
    let text
    try {
      response = await fetch(`${root}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs)
      })
      text = await response.text()
    } catch {
      throw new GatewayError({
        status: 503,
        code: 'gateway_unreachable',
        message: 'The AI gateway did not answer.',
        requestId
      })
    }
    const payload = parseJson(text)
    const responseRequestId = response.headers.get('x-request-id') ?? requestId
    if (response.ok) {
      return {
        status: response.status,
        body: payload,
        requestId: responseRequestId
      }
    }
    throw new GatewayError({
      status: response.status,
      code: payload?.error?.code ?? 'gateway_error',
      message:
        payload?.error?.message ??
        `The AI gateway answered with status ${response.status}.`,
      requestId: responseRequestId
    })
  }

  return { adminRequest }
}
