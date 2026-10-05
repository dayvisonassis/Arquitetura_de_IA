import { HttpErrorResponse } from '@angular/common/http'
import { NO_ERRORS_SCHEMA } from '@angular/core'
import { ComponentFixture, TestBed } from '@angular/core/testing'
import { provideNoopAnimations } from '@angular/platform-browser/animations'
import { Router } from '@angular/router'
import { Subject, of, throwError } from 'rxjs'

import { CurrentUserService } from 'app/services/current-user.service'
import { LANDING_ROUTES, Me, Role } from 'app/services/session.model'
import { SignInComponent } from './sign-in.component'
import { SignInService } from './sign-in.service'

jest.setTimeout(10000)

const SIGNED_OUT = 'Você saiu do sistema.'
const SESSION_EXPIRED = 'Sua sessão expirou. Entre novamente.'
const UNAVAILABLE =
  'Serviço temporariamente indisponível. Tente novamente em instantes.'

const buildMe = (role: Role): Me => ({
  id: `${role}-id`,
  name: `Name of ${role}`,
  email: `${role}@example.com`,
  role,
  domain: role === 'platform_admin' ? null : { id: 'd1', name: 'Acme' },
  permissions: []
})

describe('SignInComponent', () => {
  let fixture: ComponentFixture<SignInComponent> | null = null
  let component: SignInComponent
  let signInServiceMock: { login: jest.Mock }
  let currentUserServiceMock: { load: jest.Mock; landingRoute: jest.Mock }
  let routerMock: { navigateByUrl: jest.Mock }

  const element = (): HTMLElement => fixture!.nativeElement

  const query = <T extends Element>(selector: string): T | null =>
    element().querySelector<T>(selector)

  const submitButton = (): HTMLButtonElement =>
    query<HTMLButtonElement>('form.sign-in-form button[type="submit"]')!

  const passwordInput = (): HTMLInputElement =>
    query<HTMLInputElement>('input[formControlName="password"]')!

  const toggleButton = (): HTMLButtonElement =>
    query<HTMLButtonElement>('form.sign-in-form button[type="button"]')!

  const typeInto = (selector: string, value: string): void => {
    const input = query<HTMLInputElement>(selector)!
    input.value = value
    input.dispatchEvent(new Event('input'))
  }

  const fillForm = (email: string, password: string): void => {
    typeInto('input[formControlName="email"]', email)
    typeInto('input[formControlName="password"]', password)
    fixture!.detectChanges()
  }

  const submitForm = (): void => {
    query<HTMLFormElement>('form.sign-in-form')!.dispatchEvent(
      new Event('submit')
    )
    fixture!.detectChanges()
  }

  const createComponent = (): void => {
    fixture = TestBed.createComponent(SignInComponent)
    component = fixture.componentInstance
    fixture.detectChanges()
  }

  beforeEach(async () => {
    if (fixture) {
      fixture.destroy()
      fixture = null
    }
    TestBed.resetTestingModule()
    jest.clearAllMocks()
    window.history.replaceState(null, '')
    signInServiceMock = {
      login: jest.fn(() =>
        of({ token: 'jwt-token', expires_at: '2026-10-05T12:00:00Z' })
      )
    }
    currentUserServiceMock = {
      load: jest.fn(() => of(buildMe('user'))),
      landingRoute: jest.fn((me: Me) => LANDING_ROUTES[me.role])
    }
    routerMock = { navigateByUrl: jest.fn(() => Promise.resolve(true)) }
    await TestBed.configureTestingModule({
      imports: [SignInComponent],
      providers: [
        provideNoopAnimations(),
        { provide: SignInService, useValue: signInServiceMock },
        { provide: CurrentUserService, useValue: currentUserServiceMock },
        { provide: Router, useValue: routerMock }
      ],
      schemas: [NO_ERRORS_SCHEMA]
    }).compileComponents()
  })

  afterEach(() => {
    try {
      fixture?.destroy()
    } catch {
      // The fixture may already be destroyed
    }
    fixture = null
    window.history.replaceState(null, '')
  })

  describe('rendering', () => {
    beforeEach(() => createComponent())

    it('should render the title, the subtitle, the fields and the submit button', () => {
      expect(query('h1.title')?.textContent?.trim()).toBe('AI Gateway')
      expect(query('p.login-box-msg')?.textContent?.trim()).toBe(
        'Entre com seu e-mail e senha.'
      )
      expect(query('input[formControlName="email"]')).not.toBeNull()
      expect(passwordInput()).not.toBeNull()
      expect(submitButton().textContent?.trim()).toBe('Entrar')
    })

    it('should not show any message without a navigation state', () => {
      expect(component.infoMessage).toBeNull()
      expect(query('p.callout-info')).toBeNull()
      expect(query('p.callout-error')).toBeNull()
    })
  })

  describe('submit button', () => {
    beforeEach(() => createComponent())

    it('should be disabled while both fields are empty', () => {
      expect(submitButton().disabled).toBe(true)
    })

    it('should be disabled while the password is empty', () => {
      fillForm('ana@example.com', '')

      expect(submitButton().disabled).toBe(true)
    })

    it('should be disabled while the email is empty', () => {
      fillForm('', 'secret-password')

      expect(submitButton().disabled).toBe(true)
    })

    it('should be enabled when both fields are filled', () => {
      fillForm('ana@example.com', 'secret-password')

      expect(submitButton().disabled).toBe(false)
    })

    it('should be disabled while the login is being submitted', () => {
      signInServiceMock.login.mockReturnValue(new Subject())
      fillForm('ana@example.com', 'secret-password')

      submitForm()

      expect(component.submitting).toBe(true)
      expect(submitButton().disabled).toBe(true)
    })
  })

  describe('submit', () => {
    it('should ignore the submit while the form is invalid', () => {
      createComponent()

      component.submit()

      expect(signInServiceMock.login).not.toHaveBeenCalled()
      expect(component.submitting).toBe(false)
    })

    it('should ignore a second submit while the first is pending', () => {
      signInServiceMock.login.mockReturnValue(new Subject())
      createComponent()
      fillForm('ana@example.com', 'secret-password')

      component.submit()
      component.submit()

      expect(signInServiceMock.login).toHaveBeenCalledTimes(1)
    })

    it('should log in, load the current user and finish the submission', () => {
      const me = buildMe('domain_admin')
      currentUserServiceMock.load.mockReturnValue(of(me))
      createComponent()
      fillForm('ana@example.com', 'secret-password')

      submitForm()

      expect(signInServiceMock.login).toHaveBeenCalledWith(
        'ana@example.com',
        'secret-password'
      )
      expect(currentUserServiceMock.load).toHaveBeenCalledTimes(1)
      expect(currentUserServiceMock.landingRoute).toHaveBeenCalledWith(me)
      expect(component.submitting).toBe(false)
      expect(component.errorMessage).toBeNull()
    })

    it.each([
      { role: 'platform_admin' as Role, route: '/domains' },
      { role: 'domain_admin' as Role, route: '/users' },
      { role: 'user' as Role, route: '/playground' }
    ])('should navigate $role to $route after the login', ({ role, route }) => {
      currentUserServiceMock.load.mockReturnValue(of(buildMe(role)))
      createComponent()
      fillForm('ana@example.com', 'secret-password')

      submitForm()

      expect(routerMock.navigateByUrl).toHaveBeenCalledTimes(1)
      expect(routerMock.navigateByUrl).toHaveBeenCalledWith(route)
    })
  })

  describe('error messages', () => {
    it.each([401, 403, 423, 429, 503])(
      'should show the backend message of a %s inside the card',
      status => {
        const message = `Backend message for status ${status}.`
        signInServiceMock.login.mockReturnValue(
          throwError(
            () => new HttpErrorResponse({ status, error: { message } })
          )
        )
        createComponent()
        fillForm('ana@example.com', 'secret-password')

        submitForm()

        expect(component.errorMessage).toBe(message)
        expect(component.submitting).toBe(false)
        const alert = query<HTMLElement>('p.callout-error[role="alert"]')
        expect(alert?.textContent?.trim()).toBe(message)
        expect(routerMock.navigateByUrl).not.toHaveBeenCalled()
      }
    )

    it('should show the unavailability message on a network failure', () => {
      signInServiceMock.login.mockReturnValue(
        throwError(
          () =>
            new HttpErrorResponse({
              status: 0,
              error: new ProgressEvent('error')
            })
        )
      )
      createComponent()
      fillForm('ana@example.com', 'secret-password')

      submitForm()

      expect(component.errorMessage).toBe(UNAVAILABLE)
      expect(query<HTMLElement>('p.callout-error')?.textContent?.trim()).toBe(
        UNAVAILABLE
      )
    })

    it('should ignore a body message when the status is 0', () => {
      signInServiceMock.login.mockReturnValue(
        throwError(
          () =>
            new HttpErrorResponse({
              status: 0,
              error: { message: 'Message that must be ignored.' }
            })
        )
      )
      createComponent()
      fillForm('ana@example.com', 'secret-password')

      submitForm()

      expect(component.errorMessage).toBe(UNAVAILABLE)
    })

    it('should show the unavailability message when the body has no message', () => {
      signInServiceMock.login.mockReturnValue(
        throwError(() => new HttpErrorResponse({ status: 500, error: null }))
      )
      createComponent()
      fillForm('ana@example.com', 'secret-password')

      submitForm()

      expect(component.errorMessage).toBe(UNAVAILABLE)
    })

    it('should show the backend message when loading the current user fails', () => {
      currentUserServiceMock.load.mockReturnValue(
        throwError(
          () =>
            new HttpErrorResponse({
              status: 503,
              error: { message: 'Database unavailable.' }
            })
        )
      )
      createComponent()
      fillForm('ana@example.com', 'secret-password')

      submitForm()

      expect(component.errorMessage).toBe('Database unavailable.')
      expect(component.submitting).toBe(false)
      expect(routerMock.navigateByUrl).not.toHaveBeenCalled()
    })

    it('should clear the previous error on a new submit', () => {
      signInServiceMock.login.mockReturnValueOnce(
        throwError(
          () =>
            new HttpErrorResponse({
              status: 401,
              error: { message: 'Invalid email or password.' }
            })
        )
      )
      createComponent()
      fillForm('ana@example.com', 'secret-password')
      submitForm()
      expect(component.errorMessage).toBe('Invalid email or password.')

      signInServiceMock.login.mockReturnValueOnce(new Subject())
      submitForm()

      expect(component.errorMessage).toBeNull()
      expect(query('p.callout-error')).toBeNull()
    })
  })

  describe('navigation message', () => {
    it.each([SIGNED_OUT, SESSION_EXPIRED])(
      'should show the message received by the navigation: %s',
      message => {
        window.history.replaceState({ message }, '')

        createComponent()

        expect(component.infoMessage).toBe(message)
        const info = query<HTMLElement>('p.callout-info[role="status"]')
        expect(info?.textContent?.trim()).toBe(message)
      }
    )

    it('should ignore a navigation message that is not a string', () => {
      window.history.replaceState({ message: 42 }, '')

      createComponent()

      expect(component.infoMessage).toBeNull()
      expect(query('p.callout-info')).toBeNull()
    })

    it('should clear the navigation message on submit', () => {
      window.history.replaceState({ message: SIGNED_OUT }, '')
      signInServiceMock.login.mockReturnValue(new Subject())
      createComponent()
      fillForm('ana@example.com', 'secret-password')

      submitForm()

      expect(component.infoMessage).toBeNull()
      expect(query('p.callout-info')).toBeNull()
    })
  })

  describe('password visibility', () => {
    beforeEach(() => createComponent())

    it('should hide the password by default', () => {
      expect(passwordInput().type).toBe('password')
      expect(toggleButton().getAttribute('aria-label')).toBe('Mostrar senha')
      expect(toggleButton().textContent?.trim()).toBe('visibility')
    })

    it('should show the password after a click on the toggle', () => {
      toggleButton().click()
      fixture!.detectChanges()

      expect(component.passwordVisible).toBe(true)
      expect(passwordInput().type).toBe('text')
      expect(toggleButton().getAttribute('aria-label')).toBe('Ocultar senha')
      expect(toggleButton().textContent?.trim()).toBe('visibility_off')
    })

    it('should hide the password again after a second click', () => {
      toggleButton().click()
      fixture!.detectChanges()
      toggleButton().click()
      fixture!.detectChanges()

      expect(passwordInput().type).toBe('password')
      expect(toggleButton().getAttribute('aria-label')).toBe('Mostrar senha')
    })

    it('should not submit the form when the toggle is clicked', () => {
      fillForm('ana@example.com', 'secret-password')

      toggleButton().click()

      expect(signInServiceMock.login).not.toHaveBeenCalled()
    })
  })
})
