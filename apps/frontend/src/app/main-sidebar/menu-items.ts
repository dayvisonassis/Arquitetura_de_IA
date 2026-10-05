import { Me } from 'app/services/session.model'

export interface MenuItem {
  label: string
  icon: string
  route: string
  permission?: string
  platformOnly?: boolean
}

const MENU_ITEMS: readonly MenuItem[] = [
  { label: 'Domínios', icon: 'domain', route: '/domains', platformOnly: true },
  {
    label: 'Usuários',
    icon: 'group',
    route: '/users',
    permission: 'users.read'
  },
  {
    label: 'Playground',
    icon: 'chat',
    route: '/playground',
    permission: 'playground.read'
  }
]

export const visibleItems = (me: Me | null): MenuItem[] =>
  me
    ? MENU_ITEMS.filter(item =>
        item.platformOnly
          ? me.role === 'platform_admin'
          : me.permissions.includes(item.permission ?? '')
      )
    : []
