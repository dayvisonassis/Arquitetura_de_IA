export const MESSAGES = Object.freeze({
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

export class AppError extends Error {
  constructor(status, message, extra = {}) {
    super(message)
    this.name = 'AppError'
    this.status = status
    this.extra = extra
  }
}

export const unauthorized = () => new AppError(401, MESSAGES.sessionExpired)

export const forbidden = () => new AppError(403, MESSAGES.forbidden)

export const serviceUnavailable = () =>
  new AppError(503, MESSAGES.serviceUnavailable)

export const accountLocked = (lockedUntil, clockTime) =>
  new AppError(
    423,
    `Conta bloqueada por 15 minutos após várias tentativas. Tente novamente às ${clockTime}.`,
    { locked_until: lockedUntil.toISOString() }
  )
