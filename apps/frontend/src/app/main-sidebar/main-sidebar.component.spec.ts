import { NO_ERRORS_SCHEMA } from '@angular/core'
import { ComponentFixture, TestBed } from '@angular/core/testing'
import { provideRouter } from '@angular/router'
import { BehaviorSubject } from 'rxjs'

import { CurrentUserService } from 'app/services/current-user.service'
import { Me, Role } from 'app/services/session.model'
import { MainSidebarComponent } from './main-sidebar.component'

const PERMISSIONS: Record<Role, string[]> = {
  platform_admin: ['users.read'],
  domain_admin: ['playground.read', 'users.read'],
  user: ['playground.read']
}

const buildMe = (role: Role): Me => ({
  id: `${role}-id`,
  name: `Name of ${role}`,
  email: `${role}@example.com`,
  role,
  domain: role === 'platform_admin' ? null : { id: 'd1', name: 'Acme' },
  permissions: PERMISSIONS[role]
})

describe('MainSidebarComponent', () => {
  let fixture: ComponentFixture<MainSidebarComponent> | null = null
  let me$: BehaviorSubject<Me | null>
  let currentUserServiceMock: { me$: BehaviorSubject<Me | null> }

  const links = (): HTMLAnchorElement[] =>
    Array.from(
      (
        fixture!.nativeElement as HTMLElement
      ).querySelectorAll<HTMLAnchorElement>('nav.sidebar a.nav-item')
    )

  const labels = (): string[] =>
    links().map(link => link.querySelector('span')?.textContent?.trim() ?? '')

  beforeEach(async () => {
    if (fixture) {
      fixture.destroy()
      fixture = null
    }
    TestBed.resetTestingModule()
    jest.clearAllMocks()
    me$ = new BehaviorSubject<Me | null>(null)
    currentUserServiceMock = { me$ }
    await TestBed.configureTestingModule({
      imports: [MainSidebarComponent],
      providers: [
        provideRouter([]),
        { provide: CurrentUserService, useValue: currentUserServiceMock }
      ],
      schemas: [NO_ERRORS_SCHEMA]
    }).compileComponents()
    fixture = TestBed.createComponent(MainSidebarComponent)
  })

  afterEach(() => {
    try {
      fixture?.destroy()
    } catch {
      // The fixture may already be destroyed
    }
    fixture = null
    me$.complete()
  })

  it('should label the navigation', () => {
    fixture!.detectChanges()

    const nav = (fixture!.nativeElement as HTMLElement).querySelector('nav')

    expect(nav?.getAttribute('aria-label')).toBe('Menu principal')
  })

  it('should render no item without a user', () => {
    fixture!.detectChanges()

    expect(links()).toHaveLength(0)
  })

  it.each([
    {
      role: 'platform_admin' as Role,
      expected: ['Domínios', 'Usuários'],
      hrefs: ['/domains', '/users'],
      icons: ['domain', 'group']
    },
    {
      role: 'domain_admin' as Role,
      expected: ['Usuários', 'Playground'],
      hrefs: ['/users', '/playground'],
      icons: ['group', 'chat']
    },
    {
      role: 'user' as Role,
      expected: ['Playground'],
      hrefs: ['/playground'],
      icons: ['chat']
    }
  ])(
    'should render the menu items of $role',
    ({ role, expected, hrefs, icons }) => {
      me$.next(buildMe(role))
      fixture!.detectChanges()

      expect(labels()).toEqual(expected)
      expect(links().map(link => link.getAttribute('href'))).toEqual(hrefs)
      expect(
        links().map(link => link.querySelector('mat-icon')?.textContent?.trim())
      ).toEqual(icons)
    }
  )

  it('should update the items when the current user changes', () => {
    me$.next(buildMe('domain_admin'))
    fixture!.detectChanges()
    expect(labels()).toEqual(['Usuários', 'Playground'])

    me$.next(buildMe('user'))
    fixture!.detectChanges()
    expect(labels()).toEqual(['Playground'])

    me$.next(null)
    fixture!.detectChanges()
    expect(links()).toHaveLength(0)
  })
})
