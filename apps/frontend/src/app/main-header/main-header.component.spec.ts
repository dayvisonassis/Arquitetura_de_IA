import { NO_ERRORS_SCHEMA } from '@angular/core'
import { ComponentFixture, TestBed } from '@angular/core/testing'
import { Router } from '@angular/router'
import { BehaviorSubject, Subject, of } from 'rxjs'

import { SignInService } from 'app/auth/sign-in/sign-in.service'
import { CurrentUserService } from 'app/services/current-user.service'
import { Me, Role } from 'app/services/session.model'
import { ThemeService } from 'app/shared/services/theme.service'
import { MainHeaderComponent } from './main-header.component'

const SIGNED_OUT = 'Você saiu do sistema.'

const buildMe = (role: Role): Me => ({
  id: `${role}-id`,
  name: `Name of ${role}`,
  email: `${role}@example.com`,
  role,
  domain: role === 'platform_admin' ? null : { id: 'd1', name: 'Acme' },
  permissions: []
})

describe('MainHeaderComponent', () => {
  let fixture: ComponentFixture<MainHeaderComponent> | null = null
  let component: MainHeaderComponent
  let me$: BehaviorSubject<Me | null>
  let isDarkMode$: BehaviorSubject<boolean>
  let currentUserServiceMock: {
    me$: BehaviorSubject<Me | null>
    clear: jest.Mock
  }
  let signInServiceMock: { logout: jest.Mock }
  let themeServiceMock: {
    isDarkMode$: BehaviorSubject<boolean>
    toggle: jest.Mock
  }
  let routerMock: { navigate: jest.Mock }

  const element = (): HTMLElement => fixture!.nativeElement

  const text = (selector: string): string | undefined =>
    element().querySelector(selector)?.textContent?.replace(/\s+/g, ' ').trim()

  const themeButton = (): HTMLButtonElement =>
    element().querySelector<HTMLButtonElement>(
      'header.main-header button[aria-label="Alternar tema"]'
    )!

  const logoutButton = (): HTMLButtonElement =>
    element().querySelector<HTMLButtonElement>(
      'header.main-header button.btn-secondary'
    )!

  beforeEach(async () => {
    if (fixture) {
      fixture.destroy()
      fixture = null
    }
    TestBed.resetTestingModule()
    jest.clearAllMocks()
    me$ = new BehaviorSubject<Me | null>(null)
    isDarkMode$ = new BehaviorSubject<boolean>(false)
    currentUserServiceMock = { me$, clear: jest.fn() }
    signInServiceMock = { logout: jest.fn(() => of(undefined)) }
    themeServiceMock = { isDarkMode$, toggle: jest.fn() }
    routerMock = { navigate: jest.fn(() => Promise.resolve(true)) }
    await TestBed.configureTestingModule({
      imports: [MainHeaderComponent],
      providers: [
        { provide: CurrentUserService, useValue: currentUserServiceMock },
        { provide: SignInService, useValue: signInServiceMock },
        { provide: ThemeService, useValue: themeServiceMock },
        { provide: Router, useValue: routerMock }
      ],
      schemas: [NO_ERRORS_SCHEMA]
    }).compileComponents()
    fixture = TestBed.createComponent(MainHeaderComponent)
    component = fixture.componentInstance
    fixture.detectChanges()
  })

  afterEach(() => {
    try {
      fixture?.destroy()
    } catch {
      // The fixture may already be destroyed
    }
    fixture = null
    me$.complete()
    isDarkMode$.complete()
  })

  describe('identity', () => {
    it('should render the brand and the logout button', () => {
      expect(text('header.main-header .brand')).toBe('AI Gateway')
      expect(logoutButton().textContent?.trim()).toBe('Sair')
    })

    it('should not render the identity without a user', () => {
      expect(element().querySelector('.identity')).toBeNull()
    })

    it.each([
      {
        role: 'platform_admin' as Role,
        meta: 'Administrador da plataforma · Plataforma'
      },
      { role: 'domain_admin' as Role, meta: 'Administrador do domínio · Acme' },
      { role: 'user' as Role, meta: 'Usuário · Acme' }
    ])(
      'should render the name, the role label and the domain of $role',
      ({ role, meta }) => {
        me$.next(buildMe(role))
        fixture!.detectChanges()

        expect(text('.identity .identity-name')).toBe(`Name of ${role}`)
        expect(text('.identity .identity-meta')).toBe(meta)
      }
    )

    it('should update the identity when the current user changes', () => {
      me$.next(buildMe('user'))
      fixture!.detectChanges()
      me$.next(buildMe('platform_admin'))
      fixture!.detectChanges()

      expect(text('.identity .identity-name')).toBe('Name of platform_admin')

      me$.next(null)
      fixture!.detectChanges()

      expect(element().querySelector('.identity')).toBeNull()
    })

    it('should label the platform when the user has no domain', () => {
      expect(component.domainLabel(buildMe('platform_admin'))).toBe(
        'Plataforma'
      )
      expect(component.roleLabel(buildMe('platform_admin'))).toBe(
        'Administrador da plataforma'
      )
    })
  })

  describe('theme', () => {
    it('should show the dark mode icon while the light theme is active', () => {
      expect(themeButton().textContent?.trim()).toBe('dark_mode')
    })

    it('should show the light mode icon while the dark theme is active', () => {
      isDarkMode$.next(true)
      fixture!.detectChanges()

      expect(themeButton().textContent?.trim()).toBe('light_mode')
    })

    it('should toggle the theme when the theme icon is clicked', () => {
      themeButton().click()

      expect(themeServiceMock.toggle).toHaveBeenCalledTimes(1)
    })
  })

  describe('logout', () => {
    it('should log out, clear the user and go to the login with the signed out message', () => {
      logoutButton().click()

      expect(signInServiceMock.logout).toHaveBeenCalledTimes(1)
      expect(currentUserServiceMock.clear).toHaveBeenCalledTimes(1)
      expect(routerMock.navigate).toHaveBeenCalledTimes(1)
      expect(routerMock.navigate).toHaveBeenCalledWith(['/login'], {
        state: { message: SIGNED_OUT }
      })
    })

    it('should wait for the logout to finish before leaving', () => {
      const logout = new Subject<void>()
      signInServiceMock.logout.mockReturnValue(logout.asObservable())

      logoutButton().click()

      expect(currentUserServiceMock.clear).not.toHaveBeenCalled()
      expect(routerMock.navigate).not.toHaveBeenCalled()

      logout.next()
      logout.complete()

      expect(currentUserServiceMock.clear).toHaveBeenCalledTimes(1)
      expect(routerMock.navigate).toHaveBeenCalledTimes(1)
    })
  })
})
