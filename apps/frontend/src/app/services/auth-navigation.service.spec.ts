import { Router } from '@angular/router'

import { SignInService } from 'app/auth/sign-in/sign-in.service'
import { AuthNavigationService } from './auth-navigation.service'
import { CurrentUserService } from './current-user.service'

const SESSION_EXPIRED = 'Sua sessão expirou. Entre novamente.'

const flushPromises = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0))

describe('AuthNavigationService', () => {
  let service: AuthNavigationService
  let routerMock: { navigate: jest.Mock }
  let signInServiceMock: { clearSession: jest.Mock }
  let currentUserServiceMock: { clear: jest.Mock }

  beforeEach(() => {
    jest.clearAllMocks()
    routerMock = { navigate: jest.fn(() => Promise.resolve(true)) }
    signInServiceMock = { clearSession: jest.fn() }
    currentUserServiceMock = { clear: jest.fn() }
    service = new AuthNavigationService(
      routerMock as unknown as Router,
      signInServiceMock as unknown as SignInService,
      currentUserServiceMock as unknown as CurrentUserService
    )
  })

  describe('sessionExpired', () => {
    it('should clear the session and the user and go to the login with the expired message', () => {
      service.sessionExpired()

      expect(signInServiceMock.clearSession).toHaveBeenCalledTimes(1)
      expect(currentUserServiceMock.clear).toHaveBeenCalledTimes(1)
      expect(routerMock.navigate).toHaveBeenCalledTimes(1)
      expect(routerMock.navigate).toHaveBeenCalledWith(['/login'], {
        state: { message: SESSION_EXPIRED }
      })
    })

    it('should redirect only once when called twice while the navigation is pending', () => {
      routerMock.navigate.mockReturnValue(new Promise<boolean>(() => {}))

      service.sessionExpired()
      service.sessionExpired()

      expect(signInServiceMock.clearSession).toHaveBeenCalledTimes(1)
      expect(currentUserServiceMock.clear).toHaveBeenCalledTimes(1)
      expect(routerMock.navigate).toHaveBeenCalledTimes(1)
    })

    it('should allow a new redirect after the navigation settles', async () => {
      let settle: (value: boolean) => void = () => {}
      routerMock.navigate.mockReturnValueOnce(
        new Promise<boolean>(resolve => {
          settle = resolve
        })
      )

      service.sessionExpired()
      service.sessionExpired()
      expect(routerMock.navigate).toHaveBeenCalledTimes(1)

      settle(true)
      await flushPromises()
      service.sessionExpired()

      expect(routerMock.navigate).toHaveBeenCalledTimes(2)
      expect(signInServiceMock.clearSession).toHaveBeenCalledTimes(2)
      expect(currentUserServiceMock.clear).toHaveBeenCalledTimes(2)
    })

    it('should allow a new redirect after a navigation that resolves to false', async () => {
      routerMock.navigate.mockReturnValueOnce(Promise.resolve(false))

      service.sessionExpired()
      await flushPromises()
      service.sessionExpired()

      expect(routerMock.navigate).toHaveBeenCalledTimes(2)
    })
  })

  describe('forbidden', () => {
    it('should open the forbidden page without changing the URL', () => {
      service.forbidden()

      expect(routerMock.navigate).toHaveBeenCalledWith(['/forbidden'], {
        skipLocationChange: true
      })
      expect(signInServiceMock.clearSession).not.toHaveBeenCalled()
    })
  })

  describe('notFound', () => {
    it('should open the not found page without changing the URL', () => {
      service.notFound()

      expect(routerMock.navigate).toHaveBeenCalledWith(['/not-found'], {
        skipLocationChange: true
      })
      expect(signInServiceMock.clearSession).not.toHaveBeenCalled()
    })
  })
})
