import { HttpErrorResponse } from '@angular/common/http'
import { TestBed } from '@angular/core/testing'
import {
  ActivatedRouteSnapshot,
  CanActivateFn,
  DefaultUrlSerializer,
  GuardResult,
  RedirectCommand,
  Router,
  RouterStateSnapshot,
  UrlTree
} from '@angular/router'
import { firstValueFrom, isObservable, of, throwError } from 'rxjs'

import { SignInService } from 'app/auth/sign-in/sign-in.service'
import { CurrentUserService } from 'app/services/current-user.service'
import { Me, Role } from 'app/services/session.model'
import {
  authGuard,
  landingGuard,
  loginGuard,
  permissionGuard,
  platformAdminGuard
} from './auth.guard'

const SESSION_EXPIRED = 'Sua sessão expirou. Entre novamente.'

const buildMe = (role: Role, permissions: string[] = []): Me => ({
  id: `${role}-id`,
  name: `Name of ${role}`,
  email: `${role}@example.com`,
  role,
  domain: role === 'platform_admin' ? null : { id: 'd1', name: 'Acme' },
  permissions
})

describe('auth guards', () => {
  const serializer = new DefaultUrlSerializer()
  let signInServiceMock: {
    getToken: jest.Mock
    isSessionExpired: jest.Mock
    clearSession: jest.Mock
  }
  let currentUserServiceMock: {
    ensureLoaded: jest.Mock
    landingRoute: jest.Mock
    clear: jest.Mock
  }
  let routerMock: { parseUrl: jest.Mock }

  const runGuard = async (
    guard: CanActivateFn,
    data: Record<string, unknown> = {}
  ): Promise<GuardResult> => {
    const result = TestBed.runInInjectionContext(() =>
      guard(
        { data } as unknown as ActivatedRouteSnapshot,
        {} as RouterStateSnapshot
      )
    )
    return isObservable(result) ? firstValueFrom(result) : result
  }

  const serialized = (result: GuardResult): string => {
    expect(result).toBeInstanceOf(UrlTree)
    return serializer.serialize(result as UrlTree)
  }

  const httpError = (status: number): HttpErrorResponse =>
    new HttpErrorResponse({ status })

  beforeEach(() => {
    TestBed.resetTestingModule()
    jest.clearAllMocks()
    signInServiceMock = {
      getToken: jest.fn(() => 'jwt-token'),
      isSessionExpired: jest.fn(() => false),
      clearSession: jest.fn()
    }
    currentUserServiceMock = {
      ensureLoaded: jest.fn(() => of(buildMe('user', ['playground.read']))),
      landingRoute: jest.fn(() => '/playground'),
      clear: jest.fn()
    }
    routerMock = { parseUrl: jest.fn((url: string) => serializer.parse(url)) }
    TestBed.configureTestingModule({
      providers: [
        { provide: SignInService, useValue: signInServiceMock },
        { provide: CurrentUserService, useValue: currentUserServiceMock },
        { provide: Router, useValue: routerMock }
      ]
    })
  })

  describe('authGuard', () => {
    it('should send to the login when there is no token', async () => {
      signInServiceMock.getToken.mockReturnValue(null)

      const result = await runGuard(authGuard)

      expect(serialized(result)).toBe('/login')
      expect(signInServiceMock.clearSession).not.toHaveBeenCalled()
      expect(currentUserServiceMock.ensureLoaded).not.toHaveBeenCalled()
    })

    it('should clear an expired session and send to the login with the expired message', async () => {
      signInServiceMock.isSessionExpired.mockReturnValue(true)

      const result = await runGuard(authGuard)

      expect(signInServiceMock.clearSession).toHaveBeenCalledTimes(1)
      expect(currentUserServiceMock.clear).toHaveBeenCalledTimes(1)
      expect(currentUserServiceMock.ensureLoaded).not.toHaveBeenCalled()
      expect(result).toBeInstanceOf(RedirectCommand)
      const command = result as RedirectCommand
      expect(serializer.serialize(command.redirectTo)).toBe('/login')
      expect(command.navigationBehaviorOptions).toEqual({
        state: { message: SESSION_EXPIRED }
      })
    })

    it('should allow the route once the current user is loaded', async () => {
      const result = await runGuard(authGuard)

      expect(result).toBe(true)
      expect(currentUserServiceMock.ensureLoaded).toHaveBeenCalledTimes(1)
      expect(signInServiceMock.clearSession).not.toHaveBeenCalled()
    })

    it.each([503, 0])(
      'should send to the unavailable page and keep the session when the me request fails with status %s',
      async status => {
        currentUserServiceMock.ensureLoaded.mockReturnValue(
          throwError(() => httpError(status))
        )

        const result = await runGuard(authGuard)

        expect(serialized(result)).toBe('/unavailable')
        expect(signInServiceMock.clearSession).not.toHaveBeenCalled()
        expect(currentUserServiceMock.clear).not.toHaveBeenCalled()
      }
    )

    it.each([401, 500])(
      'should block the route when the me request fails with status %s',
      async status => {
        currentUserServiceMock.ensureLoaded.mockReturnValue(
          throwError(() => httpError(status))
        )

        const result = await runGuard(authGuard)

        expect(result).toBe(false)
      }
    )
  })

  describe('loginGuard', () => {
    it('should open the login when there is no token', async () => {
      signInServiceMock.getToken.mockReturnValue(null)

      const result = await runGuard(loginGuard)

      expect(result).toBe(true)
      expect(currentUserServiceMock.ensureLoaded).not.toHaveBeenCalled()
    })

    it('should open the login when the session is expired', async () => {
      signInServiceMock.isSessionExpired.mockReturnValue(true)

      const result = await runGuard(loginGuard)

      expect(result).toBe(true)
      expect(currentUserServiceMock.ensureLoaded).not.toHaveBeenCalled()
    })

    it('should send a valid session to the landing route of the role', async () => {
      const me = buildMe('domain_admin', ['playground.read', 'users.read'])
      currentUserServiceMock.ensureLoaded.mockReturnValue(of(me))
      currentUserServiceMock.landingRoute.mockReturnValue('/users')

      const result = await runGuard(loginGuard)

      expect(currentUserServiceMock.landingRoute).toHaveBeenCalledWith(me)
      expect(serialized(result)).toBe('/users')
    })

    it('should open the login when the me request fails', async () => {
      currentUserServiceMock.ensureLoaded.mockReturnValue(
        throwError(() => httpError(503))
      )

      const result = await runGuard(loginGuard)

      expect(result).toBe(true)
    })
  })

  describe('landingGuard', () => {
    it('should redirect to the landing route of the role', async () => {
      const me = buildMe('platform_admin', ['users.read'])
      currentUserServiceMock.ensureLoaded.mockReturnValue(of(me))
      currentUserServiceMock.landingRoute.mockReturnValue('/domains')

      const result = await runGuard(landingGuard)

      expect(currentUserServiceMock.landingRoute).toHaveBeenCalledWith(me)
      expect(serialized(result)).toBe('/domains')
    })

    it('should block the route when the me request fails', async () => {
      currentUserServiceMock.ensureLoaded.mockReturnValue(
        throwError(() => httpError(500))
      )

      const result = await runGuard(landingGuard)

      expect(result).toBe(false)
    })
  })

  describe('permissionGuard', () => {
    it('should allow a user that has the permission of the route', async () => {
      currentUserServiceMock.ensureLoaded.mockReturnValue(
        of(buildMe('domain_admin', ['playground.read', 'users.read']))
      )

      const result = await runGuard(permissionGuard, {
        permission: 'users.read'
      })

      expect(result).toBe(true)
    })

    it('should open the forbidden page without changing the URL when the permission is missing', async () => {
      currentUserServiceMock.ensureLoaded.mockReturnValue(
        of(buildMe('user', ['playground.read']))
      )

      const result = await runGuard(permissionGuard, {
        permission: 'users.read'
      })

      expect(result).toBeInstanceOf(RedirectCommand)
      const command = result as RedirectCommand
      expect(serializer.serialize(command.redirectTo)).toBe('/forbidden')
      expect(command.navigationBehaviorOptions).toEqual({
        skipLocationChange: true
      })
    })

    it('should block the route when the me request fails', async () => {
      currentUserServiceMock.ensureLoaded.mockReturnValue(
        throwError(() => httpError(503))
      )

      const result = await runGuard(permissionGuard, {
        permission: 'users.read'
      })

      expect(result).toBe(false)
    })
  })

  describe('platformAdminGuard', () => {
    it('should allow the platform admin', async () => {
      currentUserServiceMock.ensureLoaded.mockReturnValue(
        of(buildMe('platform_admin', ['users.read']))
      )

      const result = await runGuard(platformAdminGuard)

      expect(result).toBe(true)
    })

    it.each(['domain_admin', 'user'] as Role[])(
      'should open the forbidden page without changing the URL for %s',
      async role => {
        currentUserServiceMock.ensureLoaded.mockReturnValue(
          of(buildMe(role, ['playground.read', 'users.read']))
        )

        const result = await runGuard(platformAdminGuard)

        expect(result).toBeInstanceOf(RedirectCommand)
        const command = result as RedirectCommand
        expect(serializer.serialize(command.redirectTo)).toBe('/forbidden')
        expect(command.navigationBehaviorOptions).toEqual({
          skipLocationChange: true
        })
      }
    )

    it('should block the route when the me request fails', async () => {
      currentUserServiceMock.ensureLoaded.mockReturnValue(
        throwError(() => httpError(0))
      )

      const result = await runGuard(platformAdminGuard)

      expect(result).toBe(false)
    })
  })
})
