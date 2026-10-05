export type Role = 'platform_admin' | 'domain_admin' | 'user'

export interface StoredSession {
  token: string
  expires_at: string
}

export interface Me {
  id: string
  name: string
  email: string
  role: Role
  domain: { id: string; name: string } | null
  permissions: string[]
}

export const MESSAGES = {
  sessionExpired: 'Sua sessão expirou. Entre novamente.',
  signedOut: 'Você saiu do sistema.',
  unavailable:
    'Serviço temporariamente indisponível. Tente novamente em instantes.'
} as const

export const LANDING_ROUTES: Record<Role, string> = {
  platform_admin: '/domains',
  domain_admin: '/users',
  user: '/playground'
}

export const ROLE_LABELS: Record<Role, string> = {
  platform_admin: 'Administrador da plataforma',
  domain_admin: 'Administrador do domínio',
  user: 'Usuário'
}
