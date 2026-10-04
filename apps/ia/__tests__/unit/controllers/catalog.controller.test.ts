jest.mock('../../../src/config/catalog', () => ({ getCatalog: jest.fn() }))
jest.mock('../../../src/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn() }
}))
jest.mock('../../../src/services/catalog-state.service', () => {
  const actual = jest.requireActual(
    '../../../src/services/catalog-state.service'
  )
  return {
    CatalogInvalidStateError: actual.CatalogInvalidStateError,
    CatalogStateUnavailableError: actual.CatalogStateUnavailableError,
    getCatalogState: jest.fn(),
    suspendResource: jest.fn(),
    resumeResource: jest.fn(),
    unavailableCapabilities: jest.fn()
  }
})

import type { NextFunction, Request, Response } from 'express'
import { getCatalog, type Catalog } from '../../../src/config/catalog'
import {
  getCatalogView,
  resumeCapability,
  resumeDeployment,
  suspendCapability,
  suspendDeployment
} from '../../../src/controllers/catalog.controller'
import logger from '../../../src/logger'
import {
  CatalogInvalidStateError,
  CatalogStateUnavailableError,
  getCatalogState,
  resumeResource,
  suspendResource,
  unavailableCapabilities,
  type CatalogState
} from '../../../src/services/catalog-state.service'

const ACTOR = 'admin_platform@aigateway.test'
const SUSPENSION = {
  reason: 'incident',
  actor: ACTOR,
  suspended_at: '2026-10-04T14:05:12.345Z'
}
const COOLDOWN_UNTIL = '2026-10-04T14:06:00.000Z'

const CATALOG: Catalog = {
  deployments: [
    {
      name: 'primary-a',
      provider: 'openai',
      model: 'gpt-4.1-mini',
      credential_env: 'OPENAI_API_KEY',
      params: ['max_tokens'],
      param_mappings: { max_tokens: 'max_completion_tokens' },
      fixed_params: {},
      price_per_million_tokens: { input: 0.4, output: 1.6 }
    }
  ],
  capabilities: [
    {
      name: 'ticket-classifier',
      type: 'chat',
      description: 'Classifies a support ticket.',
      primary: 'primary-a',
      fallback: null,
      timeout_seconds: 10,
      max_retries: 1,
      max_tokens: 256,
      json_mode: true,
      contract: null
    }
  ]
}

const activeState = (): CatalogState => ({
  capabilities: {
    'ticket-classifier': { state: 'active', suspension: null }
  },
  deployments: {
    'primary-a': { state: 'active', suspension: null, cooldown_until: null }
  }
})

const UNAVAILABLE_MESSAGE =
  'O estado do catálogo está temporariamente indisponível.'

let res: Response
let status: jest.Mock
let json: jest.Mock
let next: NextFunction
let logInfo: jest.Mock

const requestFor = (name: string, body?: unknown, withLog = true): Request =>
  ({
    params: { name },
    body,
    id: '4bf92f3577b34da6a3ce929d0e0e4736',
    log: withLog ? { info: logInfo } : undefined
  }) as unknown as Request

const errorBody = () => json.mock.calls[0][0].error

describe('catalog.controller', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    json = jest.fn()
    status = jest.fn().mockReturnValue({ json })
    res = { status } as unknown as Response
    next = jest.fn()
    logInfo = jest.fn()
    jest.mocked(getCatalog).mockReturnValue(CATALOG)
    jest.mocked(getCatalogState).mockResolvedValue(activeState())
    jest.mocked(suspendResource).mockResolvedValue(SUSPENSION)
    jest.mocked(resumeResource).mockResolvedValue(undefined)
    jest.mocked(unavailableCapabilities).mockReturnValue([])
  })

  describe('getCatalogView', () => {
    it('should answer 200 with the definitions and the state, without credential_env', async () => {
      await getCatalogView({} as Request, res, next)

      expect(status).toHaveBeenCalledWith(200)
      const body = json.mock.calls[0][0]
      expect(body.capabilities).toEqual([
        { ...CATALOG.capabilities[0], state: 'active', suspension: null }
      ])
      expect(body.deployments).toEqual([
        {
          name: 'primary-a',
          provider: 'openai',
          model: 'gpt-4.1-mini',
          params: ['max_tokens'],
          param_mappings: { max_tokens: 'max_completion_tokens' },
          fixed_params: {},
          price_per_million_tokens: { input: 0.4, output: 1.6 },
          state: 'active',
          suspension: null,
          cooldown_until: null
        }
      ])
      expect(JSON.stringify(body)).not.toContain('credential_env')
    })

    it('should answer 503 when the state is unavailable', async () => {
      jest
        .mocked(getCatalogState)
        .mockRejectedValue(new CatalogStateUnavailableError())

      await getCatalogView({} as Request, res, next)

      expect(status).toHaveBeenCalledWith(503)
      expect(errorBody()).toEqual({
        code: 'catalog_state_unavailable',
        type: 'server_error',
        message: UNAVAILABLE_MESSAGE
      })
    })

    it('should forward an unexpected error', async () => {
      const failure = new Error('boom')
      jest.mocked(getCatalogState).mockRejectedValue(failure)

      await getCatalogView({} as Request, res, next)

      expect(next).toHaveBeenCalledWith(failure)
      expect(status).not.toHaveBeenCalled()
    })
  })

  describe('suspend', () => {
    it('should suspend a capability and log actor, reason and request id', async () => {
      await suspendCapability(
        requestFor('ticket-classifier', {
          reason: '  incident  ',
          actor: ACTOR
        }),
        res,
        next
      )

      expect(suspendResource).toHaveBeenCalledWith(
        'capability',
        'ticket-classifier',
        { reason: 'incident', actor: ACTOR }
      )
      expect(status).toHaveBeenCalledWith(200)
      expect(json).toHaveBeenCalledWith({
        capability: {
          ...CATALOG.capabilities[0],
          state: 'suspended',
          suspension: SUSPENSION
        },
        warnings: []
      })
      expect(unavailableCapabilities).not.toHaveBeenCalled()
      expect(logInfo).toHaveBeenCalledWith(
        {
          type: 'capability',
          name: 'ticket-classifier',
          actor: ACTOR,
          reason: 'incident',
          requestId: '4bf92f3577b34da6a3ce929d0e0e4736'
        },
        'Catalog resource suspended'
      )
    })

    it('should warn about capabilities left without a deployment', async () => {
      jest
        .mocked(unavailableCapabilities)
        .mockReturnValue(['ticket-classifier'])

      await suspendDeployment(
        requestFor('primary-a', { reason: 'incident', actor: ACTOR }),
        res,
        next
      )

      const state = jest.mocked(unavailableCapabilities).mock.calls[0][1]
      expect(state.deployments['primary-a'].state).toBe('suspended')
      expect(json).toHaveBeenCalledWith({
        deployment: expect.objectContaining({
          name: 'primary-a',
          state: 'suspended',
          suspension: SUSPENSION,
          cooldown_until: null
        }),
        warnings: [
          "A capacidade 'ticket-classifier' ficará indisponível enquanto o deployment estiver suspenso."
        ]
      })
    })

    it('should keep the cooldown end of a suspended deployment', async () => {
      const state = activeState()
      state.deployments['primary-a'] = {
        state: 'cooldown',
        suspension: null,
        cooldown_until: COOLDOWN_UNTIL
      }
      jest.mocked(getCatalogState).mockResolvedValue(state)

      await suspendDeployment(
        requestFor('primary-a', { reason: 'incident', actor: ACTOR }),
        res,
        next
      )

      expect(json.mock.calls[0][0].deployment).toMatchObject({
        state: 'suspended',
        cooldown_until: COOLDOWN_UNTIL
      })
    })

    it('should log through the app logger when the request has none', async () => {
      await suspendCapability(
        requestFor('ticket-classifier', { reason: 'x', actor: ACTOR }, false),
        res,
        next
      )

      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'ticket-classifier' }),
        'Catalog resource suspended'
      )
    })

    it.each([
      ['capability', 'A capacidade', suspendCapability],
      ['deployment', 'O deployment', suspendDeployment]
    ] as const)(
      'should answer 404 for an unknown %s',
      async (_type, article, handler) => {
        await handler(
          requestFor('nao-existe', { reason: 'x', actor: ACTOR }),
          res,
          next
        )

        expect(status).toHaveBeenCalledWith(404)
        expect(errorBody()).toEqual({
          code: 'not_found',
          type: 'invalid_request_error',
          message: `${article} 'nao-existe' não existe no catálogo.`
        })
        expect(suspendResource).not.toHaveBeenCalled()
      }
    )

    it.each([
      [
        undefined,
        "O campo 'reason' é obrigatório e aceita até 200 caracteres."
      ],
      [
        { actor: ACTOR },
        "O campo 'reason' é obrigatório e aceita até 200 caracteres."
      ],
      [
        { reason: '   ', actor: ACTOR },
        "O campo 'reason' é obrigatório e aceita até 200 caracteres."
      ],
      [
        { reason: 'r'.repeat(201), actor: ACTOR },
        "O campo 'reason' é obrigatório e aceita até 200 caracteres."
      ],
      [{ reason: 'x' }, "O campo 'actor' precisa ser um e-mail."],
      [
        { reason: 'x', actor: 'admin' },
        "O campo 'actor' precisa ser um e-mail."
      ],
      [
        { reason: 'x', actor: `${'a'.repeat(250)}@b.test` },
        "O campo 'actor' precisa ser um e-mail."
      ],
      [{ reason: 'x', actor: ACTOR, foo: 1 }, "O campo 'foo' não é aceito."],
      [['x'], 'O corpo da requisição precisa ser um objeto JSON.']
    ])('should answer 400 for the body %p', async (body, message) => {
      await suspendCapability(requestFor('ticket-classifier', body), res, next)

      expect(status).toHaveBeenCalledWith(400)
      expect(errorBody()).toEqual({
        code: 'invalid_value',
        type: 'invalid_request_error',
        message
      })
      expect(getCatalogState).not.toHaveBeenCalled()
      expect(suspendResource).not.toHaveBeenCalled()
    })

    it.each([
      [
        suspendCapability,
        'ticket-classifier',
        "A capacidade 'ticket-classifier' já está suspensa."
      ],
      [
        suspendDeployment,
        'primary-a',
        "O deployment 'primary-a' já está suspenso."
      ]
    ])(
      'should answer 409 when already suspended',
      async (handler, name, message) => {
        jest
          .mocked(suspendResource)
          .mockRejectedValue(
            new CatalogInvalidStateError('capability', name, true)
          )

        await handler(
          requestFor(name, { reason: 'x', actor: ACTOR }),
          res,
          next
        )

        expect(status).toHaveBeenCalledWith(409)
        expect(errorBody()).toEqual({
          code: 'invalid_state',
          type: 'invalid_request_error',
          message
        })
      }
    )

    it('should answer 503 and say nothing changed', async () => {
      jest
        .mocked(getCatalogState)
        .mockRejectedValue(new CatalogStateUnavailableError())

      await suspendCapability(
        requestFor('ticket-classifier', { reason: 'x', actor: ACTOR }),
        res,
        next
      )

      expect(status).toHaveBeenCalledWith(503)
      expect(errorBody()).toEqual({
        code: 'catalog_state_unavailable',
        type: 'server_error',
        message: `${UNAVAILABLE_MESSAGE} Nada foi alterado.`
      })
      expect(suspendResource).not.toHaveBeenCalled()
    })

    it('should answer 503 and ask to check the state when unconfirmed', async () => {
      jest
        .mocked(suspendResource)
        .mockRejectedValue(new CatalogStateUnavailableError(true))

      await suspendCapability(
        requestFor('ticket-classifier', { reason: 'x', actor: ACTOR }),
        res,
        next
      )

      expect(status).toHaveBeenCalledWith(503)
      expect(errorBody().message).toBe(
        'Não foi possível confirmar a operação. Confira o estado do catálogo antes de repetir.'
      )
    })

    it('should forward an unexpected error', async () => {
      const failure = new Error('boom')
      jest.mocked(suspendResource).mockRejectedValue(failure)

      await suspendCapability(
        requestFor('ticket-classifier', { reason: 'x', actor: ACTOR }),
        res,
        next
      )

      expect(next).toHaveBeenCalledWith(failure)
    })
  })

  describe('resume', () => {
    it('should resume a capability', async () => {
      const state = activeState()
      state.capabilities['ticket-classifier'] = {
        state: 'suspended',
        suspension: SUSPENSION
      }
      jest.mocked(getCatalogState).mockResolvedValue(state)

      await resumeCapability(
        requestFor('ticket-classifier', { actor: ACTOR }),
        res,
        next
      )

      expect(resumeResource).toHaveBeenCalledWith(
        'capability',
        'ticket-classifier'
      )
      expect(json).toHaveBeenCalledWith({
        capability: expect.objectContaining({
          state: 'active',
          suspension: null
        }),
        warnings: []
      })
      expect(logInfo).toHaveBeenCalledWith(
        expect.objectContaining({ actor: ACTOR, reason: undefined }),
        'Catalog resource resumed'
      )
    })

    it('should show a resumed deployment in cooldown when its cooldown is running', async () => {
      const state = activeState()
      state.deployments['primary-a'] = {
        state: 'suspended',
        suspension: SUSPENSION,
        cooldown_until: COOLDOWN_UNTIL
      }
      jest.mocked(getCatalogState).mockResolvedValue(state)

      await resumeDeployment(
        requestFor('primary-a', { actor: ACTOR, reason: '' }),
        res,
        next
      )

      expect(json.mock.calls[0][0]).toEqual({
        deployment: expect.objectContaining({
          state: 'cooldown',
          suspension: null,
          cooldown_until: COOLDOWN_UNTIL
        }),
        warnings: []
      })
    })

    it('should answer 400 for a reason above 200 characters', async () => {
      await resumeDeployment(
        requestFor('primary-a', { actor: ACTOR, reason: 'r'.repeat(201) }),
        res,
        next
      )

      expect(status).toHaveBeenCalledWith(400)
      expect(errorBody().message).toBe(
        "O campo 'reason' aceita até 200 caracteres."
      )
    })

    it.each([
      [
        resumeCapability,
        'ticket-classifier',
        "A capacidade 'ticket-classifier' não está suspensa."
      ],
      [
        resumeDeployment,
        'primary-a',
        "O deployment 'primary-a' não está suspenso."
      ]
    ])(
      'should answer 409 when not suspended',
      async (handler, name, message) => {
        jest
          .mocked(resumeResource)
          .mockRejectedValue(
            new CatalogInvalidStateError('deployment', name, false)
          )

        await handler(requestFor(name, { actor: ACTOR }), res, next)

        expect(status).toHaveBeenCalledWith(409)
        expect(errorBody().message).toBe(message)
      }
    )
  })
})
