const { MatchersV3, PactV3 } = require('@pact-foundation/pact')
const {
  createIaGatewayClient,
  GatewayError
} = require('../../src/services/ia-gateway.client')
const { CONSUMER, PACT_DIR } = require('../utils/reset-pacts')

const { like } = MatchersV3

const REQUEST_ID = '4bf92f3577b34da6a3ce929d0e0e4736'
const WRONG_MASTER_KEY = 'wrong-master-key-0123456789abcdefghijklm'

// What the backend relies on when the proxy refuses the master key: the
// status, the error code and type, the echoed request id and a JSON body.
// The Pact FFI does not accept a matcher on Content-Type, so it is literal.
const unauthorized = {
  status: 401,
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'x-request-id': REQUEST_ID
  },
  body: {
    error: {
      message: like('Chave administrativa ausente ou inválida.'),
      type: 'authentication_error',
      code: 'invalid_admin_key'
    }
  }
}

const provider = () =>
  new PactV3({
    consumer: CONSUMER,
    provider: 'ai-gateway-ia',
    dir: PACT_DIR,
    logLevel: 'warn'
  })

const failureOf = async promise => {
  try {
    await promise
  } catch (error) {
    return error
  }
  throw new Error('the admin request did not fail')
}

describe('ia admin API: master key (consumer)', () => {
  it('should get 401 invalid_admin_key without the master key', async () => {
    const pact = provider()
      .uponReceiving('an admin request without the master key')
      .withRequest({
        method: 'GET',
        path: '/admin/domains',
        headers: { 'x-request-id': REQUEST_ID }
      })
      .willRespondWith(unauthorized)

    await pact.executeTest(async mockServer => {
      const client = createIaGatewayClient({
        baseUrl: mockServer.url,
        masterKey: undefined,
        timeoutMs: 5000
      })

      const error = await failureOf(
        client.adminRequest({ path: '/admin/domains', requestId: REQUEST_ID })
      )

      expect(error).toBeInstanceOf(GatewayError)
      expect(error).toMatchObject({
        status: 401,
        code: 'invalid_admin_key',
        requestId: REQUEST_ID
      })
    })
  })

  it('should get 401 invalid_admin_key with a wrong master key', async () => {
    const pact = provider()
      .uponReceiving('an admin request with a wrong master key')
      .withRequest({
        method: 'GET',
        path: '/admin/domains',
        headers: {
          Authorization: `Bearer ${WRONG_MASTER_KEY}`,
          'x-request-id': REQUEST_ID
        }
      })
      .willRespondWith(unauthorized)

    await pact.executeTest(async mockServer => {
      const client = createIaGatewayClient({
        baseUrl: mockServer.url,
        masterKey: WRONG_MASTER_KEY,
        timeoutMs: 5000
      })

      const error = await failureOf(
        client.adminRequest({ path: '/admin/domains', requestId: REQUEST_ID })
      )

      expect(error).toBeInstanceOf(GatewayError)
      expect(error).toMatchObject({
        status: 401,
        code: 'invalid_admin_key',
        requestId: REQUEST_ID
      })
    })
  })
})
