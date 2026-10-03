import {
  createIaGatewayClient,
  GatewayError
} from '../../../src/services/ia-gateway.client'

const MASTER_KEY = 'k'.repeat(40)
const REQUEST_ID = '4bf92f3577b34da6a3ce929d0e0e4736'
const RESPONSE_ID = 'aaaabbbbccccddddeeeeffff00001111'

const jsonResponse = (status, body, headers = {}) =>
  new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers }
  })

const errorOf = async promise => {
  try {
    await promise
  } catch (error) {
    return error
  }
  throw new Error('the request did not fail')
}

describe('ia-gateway.client', () => {
  let fetchMock

  beforeEach(() => {
    jest.clearAllMocks()
    fetchMock = jest.spyOn(global, 'fetch')
  })

  afterEach(() => {
    fetchMock.mockRestore()
  })

  const client = (options = {}) =>
    createIaGatewayClient({
      baseUrl: 'http://ia:3131/',
      masterKey: MASTER_KEY,
      timeoutMs: 1000,
      ...options
    })

  it('should send the master key and request id', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { data: [] }))

    await client().adminRequest({
      path: '/admin/domains',
      requestId: REQUEST_ID
    })

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('http://ia:3131/admin/domains')
    expect(init.method).toBe('GET')
    expect(init.headers).toMatchObject({
      authorization: `Bearer ${MASTER_KEY}`,
      'x-request-id': REQUEST_ID
    })
    expect(init.body).toBeUndefined()
    expect(init.signal).toBeInstanceOf(AbortSignal)
  })

  it('should omit Authorization without a key and x-request-id without an id', async () => {
    fetchMock.mockResolvedValue(jsonResponse(204))

    await client({ masterKey: undefined }).adminRequest({
      path: '/admin/domains'
    })

    const { headers } = fetchMock.mock.calls[0][1]
    expect(headers).not.toHaveProperty('authorization')
    expect(headers).not.toHaveProperty('x-request-id')
  })

  it('should send a JSON body with its content type', async () => {
    fetchMock.mockResolvedValue(jsonResponse(201, { id: 1 }))

    await client().adminRequest({
      method: 'POST',
      path: '/admin/domains',
      body: { name: 'Sales' }
    })

    const init = fetchMock.mock.calls[0][1]
    expect(init.method).toBe('POST')
    expect(init.headers['content-type']).toBe('application/json')
    expect(init.body).toBe(JSON.stringify({ name: 'Sales' }))
  })

  it('should return status, body and the request id of the response', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(200, { data: [1] }, { 'x-request-id': RESPONSE_ID })
    )

    const result = await client().adminRequest({
      path: '/admin/domains',
      requestId: REQUEST_ID
    })

    expect(result).toEqual({
      status: 200,
      body: { data: [1] },
      requestId: RESPONSE_ID
    })
  })

  it('should keep the sent request id and a null body when the response has neither', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }))

    const result = await client().adminRequest({
      path: '/admin/domains',
      requestId: REQUEST_ID
    })

    expect(result).toEqual({ status: 204, body: null, requestId: REQUEST_ID })
  })

  it('should raise GatewayError with code and request id on 401', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(
        401,
        {
          error: {
            message: 'Chave administrativa ausente ou inválida.',
            type: 'authentication_error',
            code: 'invalid_admin_key'
          }
        },
        { 'x-request-id': RESPONSE_ID }
      )
    )

    const error = await errorOf(
      client().adminRequest({ path: '/admin/domains', requestId: REQUEST_ID })
    )

    expect(error).toBeInstanceOf(GatewayError)
    expect(error).toMatchObject({
      name: 'GatewayError',
      status: 401,
      code: 'invalid_admin_key',
      message: 'Chave administrativa ausente ou inválida.',
      requestId: RESPONSE_ID
    })
  })

  it('should fall back to gateway_error when the error body is not JSON', async () => {
    fetchMock.mockResolvedValue(
      new Response('<html>bad gateway</html>', { status: 502 })
    )

    const error = await errorOf(
      client().adminRequest({ path: '/admin/domains' })
    )

    expect(error).toMatchObject({
      status: 502,
      code: 'gateway_error',
      message: 'The AI gateway answered with status 502.'
    })
  })

  it.each([
    ['fetch rejects', () => Promise.reject(new TypeError('fetch failed'))],
    [
      'the request times out',
      () => Promise.reject(new DOMException('timed out', 'TimeoutError'))
    ],
    [
      'the body is interrupted',
      () =>
        Promise.resolve({
          ok: true,
          status: 200,
          headers: new Headers(),
          text: () => Promise.reject(new Error('socket hang up'))
        })
    ]
  ])(
    'should map a network failure to gateway_unreachable (%s)',
    async (_case, outcome) => {
      fetchMock.mockImplementation(outcome)

      const error = await errorOf(
        client().adminRequest({ path: '/admin/domains', requestId: REQUEST_ID })
      )

      expect(error).toBeInstanceOf(GatewayError)
      expect(error).toMatchObject({
        status: 503,
        code: 'gateway_unreachable',
        requestId: REQUEST_ID
      })
    }
  )
})
