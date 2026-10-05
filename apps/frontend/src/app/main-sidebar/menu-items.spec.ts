import { Me, Role } from 'app/services/session.model'
import { visibleItems } from './menu-items'

const buildMe = (role: Role, permissions: string[]): Me => ({
  id: `${role}-id`,
  name: `Name of ${role}`,
  email: `${role}@example.com`,
  role,
  domain: role === 'platform_admin' ? null : { id: 'd1', name: 'Acme' },
  permissions
})

const routesOf = (me: Me | null): string[] =>
  visibleItems(me).map(item => item.route)

describe('visibleItems', () => {
  it('should show Domains and Users to the platform admin', () => {
    const items = visibleItems(buildMe('platform_admin', ['users.read']))

    expect(items.map(item => item.label)).toEqual(['Domínios', 'Usuários'])
    expect(items.map(item => item.icon)).toEqual(['domain', 'group'])
    expect(items.map(item => item.route)).toEqual(['/domains', '/users'])
  })

  it('should show Users and Playground to the domain admin', () => {
    const items = visibleItems(
      buildMe('domain_admin', ['playground.read', 'users.read'])
    )

    expect(items.map(item => item.label)).toEqual(['Usuários', 'Playground'])
    expect(items.map(item => item.icon)).toEqual(['group', 'chat'])
  })

  it('should show only Playground to the user', () => {
    expect(routesOf(buildMe('user', ['playground.read']))).toEqual([
      '/playground'
    ])
  })

  it('should show nothing without a user', () => {
    expect(visibleItems(null)).toEqual([])
  })

  it('should hide Domains from a domain admin even with every permission', () => {
    expect(
      routesOf(buildMe('domain_admin', ['users.read', 'playground.read']))
    ).not.toContain('/domains')
  })

  it('should hide the permission based items from a user without permissions', () => {
    expect(routesOf(buildMe('user', []))).toEqual([])
  })

  it('should show Domains to a platform admin without permissions', () => {
    expect(routesOf(buildMe('platform_admin', []))).toEqual(['/domains'])
  })
})
