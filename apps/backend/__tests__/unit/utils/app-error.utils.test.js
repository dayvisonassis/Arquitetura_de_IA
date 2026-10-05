import {
  accountLocked,
  AppError,
  forbidden,
  MESSAGES,
  serviceUnavailable,
  unauthorized
} from '../../../src/utils/app-error.utils'

describe('app-error.utils', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('AppError', () => {
    it('should be an Error with the status and the message', () => {
      const error = new AppError(409, 'conflict')

      expect(error).toBeInstanceOf(Error)
      expect(error).toBeInstanceOf(AppError)
      expect(error.name).toBe('AppError')
      expect(error.status).toBe(409)
      expect(error.message).toBe('conflict')
    })

    it('should default extra to an empty object', () => {
      expect(new AppError(400, 'bad').extra).toEqual({})
    })

    it('should keep the extra fields', () => {
      const extra = { field: 'email' }

      expect(new AppError(400, 'bad', extra).extra).toBe(extra)
    })
  })

  describe('ready-made errors', () => {
    it.each([
      ['unauthorized', unauthorized, 401, MESSAGES.sessionExpired],
      ['forbidden', forbidden, 403, MESSAGES.forbidden],
      [
        'serviceUnavailable',
        serviceUnavailable,
        503,
        MESSAGES.serviceUnavailable
      ]
    ])('%s should build an AppError', (_name, build, status, message) => {
      const error = build()

      expect(error).toBeInstanceOf(AppError)
      expect(error.status).toBe(status)
      expect(error.message).toBe(message)
      expect(error.extra).toEqual({})
    })

    it('should return a new instance on each call', () => {
      expect(unauthorized()).not.toBe(unauthorized())
    })
  })

  describe('accountLocked', () => {
    it('should answer 423 with the clock time and the ISO lock end', () => {
      const lockedUntil = new Date('2026-10-04T17:50:00Z')

      const error = accountLocked(lockedUntil, '14:50')

      expect(error).toBeInstanceOf(AppError)
      expect(error.status).toBe(423)
      expect(error.message).toBe(
        'Conta bloqueada por 15 minutos após várias tentativas. Tente novamente às 14:50.'
      )
      expect(error.extra).toEqual({ locked_until: '2026-10-04T17:50:00.000Z' })
    })
  })

  describe('MESSAGES', () => {
    it('should carry the messages of the spec', () => {
      expect(MESSAGES).toEqual({
        badLoginRequest: 'Informe o e-mail e a senha.',
        invalidCredentials: 'E-mail ou senha inválidos.',
        domainInactive:
          'O domínio da sua conta está desativado. Fale com o administrador da plataforma.',
        sessionExpired: 'Sua sessão expirou. Entre novamente.',
        forbidden: 'Você não tem permissão para acessar esta página.',
        domainRequired: 'Escolha um domínio.',
        domainNotFound: 'Domínio não encontrado.',
        tooManyAttempts:
          'Muitas tentativas de login. Tente novamente em alguns minutos.',
        serviceUnavailable:
          'Serviço temporariamente indisponível. Tente novamente em instantes.'
      })
    })

    it('should be frozen', () => {
      expect(Object.isFrozen(MESSAGES)).toBe(true)
    })
  })
})
