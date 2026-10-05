import {
  HttpErrorResponse,
  HttpEvent,
  HttpHandlerFn,
  HttpRequest,
  HttpResponse
} from '@angular/common/http'
import { TestBed } from '@angular/core/testing'
import { Observable, Subject, of, throwError } from 'rxjs'

import { AuthNavigationService } from 'app/services/auth-navigation.service'
import { CurrentUserService } from 'app/services/current-user.service'
import { NotificationService } from 'app/services/notification.service'
import { environment } from 'environments/environment'
import { errorInterceptor } from './error.interceptor'

describe('errorInterceptor', () => {
  let authNavigationServiceMock: {
    sessionExpired: jest.Mock
    forbidden: jest.Mock
    notFound: jest.Mock
  }
  let currentUserServiceMock: { load: jest.Mock }
  let notificationServiceMock: { showUnavailable: jest.Mock }
  let next: jest.Mock<Observable<HttpEvent<unknown>>, [HttpRequest<unknown>]>

  const failWith = (status: number): HttpErrorResponse => {
    const error = new HttpErrorResponse({ status })
    next.mockReturnValue(throwError(() => error))
    return error
  }

  const intercept = (
    url: string
  ): { request: HttpRequest<unknown>; error: unknown } => {
    const request = new HttpRequest('GET', url)
    let error: unknown = null
    TestBed.runInInjectionContext(() =>
      errorInterceptor(request, next as unknown as HttpHandlerFn)
    ).subscribe({
      error: caught => {
        error = caught
      }
    })
    return { request, error }
  }

  const expectNoHandling = (): void => {
    expect(authNavigationServiceMock.sessionExpired).not.toHaveBeenCalled()
    expect(authNavigationServiceMock.forbidden).not.toHaveBeenCalled()
    expect(authNavigationServiceMock.notFound).not.toHaveBeenCalled()
    expect(currentUserServiceMock.load).not.toHaveBeenCalled()
    expect(notificationServiceMock.showUnavailable).not.toHaveBeenCalled()
  }

  beforeEach(() => {
    TestBed.resetTestingModule()
    jest.clearAllMocks()
    authNavigationServiceMock = {
      sessionExpired: jest.fn(),
      forbidden: jest.fn(),
      notFound: jest.fn()
    }
    currentUserServiceMock = { load: jest.fn(() => of({})) }
    notificationServiceMock = { showUnavailable: jest.fn() }
    next = jest.fn(
      (_request: HttpRequest<unknown>): Observable<HttpEvent<unknown>> =>
        of(new HttpResponse({ status: 200 }))
    )
    TestBed.configureTestingModule({
      providers: [
        { provide: AuthNavigationService, useValue: authNavigationServiceMock },
        { provide: CurrentUserService, useValue: currentUserServiceMock },
        { provide: NotificationService, useValue: notificationServiceMock }
      ]
    })
  })

  describe('requests handled by the caller', () => {
    it('should pass a request outside the API untouched', () => {
      const failure = failWith(401)

      const { request, error } = intercept('https://cdn.example.com/a.json')

      expect(next).toHaveBeenCalledWith(request)
      expect(error).toBe(failure)
      expectNoHandling()
    })

    it.each(['/auth/login', '/auth/logout'])(
      'should pass a 401 from %s untouched',
      path => {
        const failure = failWith(401)

        const { request, error } = intercept(`${environment.apiUrl}${path}`)

        expect(next).toHaveBeenCalledWith(request)
        expect(error).toBe(failure)
        expectNoHandling()
      }
    )

    it('should handle a path that only starts like an ignored one', () => {
      failWith(401)

      intercept(`${environment.apiUrl}/auth/logout-all`)

      expect(authNavigationServiceMock.sessionExpired).toHaveBeenCalledTimes(1)
    })
  })

  it('should let a successful API response through', done => {
    const response = new HttpResponse({ status: 200, body: { ok: true } })
    next.mockReturnValue(of(response))

    TestBed.runInInjectionContext(() =>
      errorInterceptor(
        new HttpRequest('GET', `${environment.apiUrl}/me`),
        next as unknown as HttpHandlerFn
      )
    ).subscribe(event => {
      expect(event).toBe(response)
      expectNoHandling()
      done()
    })
  })

  describe('API errors', () => {
    it('should expire the session on a 401 and rethrow the error', () => {
      const failure = failWith(401)

      const { error } = intercept(`${environment.apiUrl}/me`)

      expect(authNavigationServiceMock.sessionExpired).toHaveBeenCalledTimes(1)
      expect(authNavigationServiceMock.forbidden).not.toHaveBeenCalled()
      expect(notificationServiceMock.showUnavailable).not.toHaveBeenCalled()
      expect(error).toBe(failure)
    })

    it('should reload the current user before opening the forbidden page on a 403', () => {
      const failure = failWith(403)
      const reload = new Subject<unknown>()
      currentUserServiceMock.load.mockReturnValue(reload.asObservable())

      const { error } = intercept(`${environment.apiUrl}/users`)

      expect(currentUserServiceMock.load).toHaveBeenCalledTimes(1)
      expect(authNavigationServiceMock.forbidden).not.toHaveBeenCalled()
      expect(error).toBe(failure)

      reload.next({ id: 'u1' })

      expect(authNavigationServiceMock.forbidden).toHaveBeenCalledTimes(1)
      expect(authNavigationServiceMock.sessionExpired).not.toHaveBeenCalled()
    })

    it('should open the forbidden page on a 403 even when the reload fails', () => {
      failWith(403)
      currentUserServiceMock.load.mockReturnValue(
        throwError(() => new HttpErrorResponse({ status: 503 }))
      )

      intercept(`${environment.apiUrl}/users`)

      expect(currentUserServiceMock.load).toHaveBeenCalledTimes(1)
      expect(authNavigationServiceMock.forbidden).toHaveBeenCalledTimes(1)
    })

    it('should open the not found page on a 404 and rethrow the error', () => {
      const failure = failWith(404)

      const { error } = intercept(`${environment.apiUrl}/users/42`)

      expect(authNavigationServiceMock.notFound).toHaveBeenCalledTimes(1)
      expect(authNavigationServiceMock.sessionExpired).not.toHaveBeenCalled()
      expect(error).toBe(failure)
    })

    it.each([503, 0])(
      'should show the unavailability message on status %s without leaving the session',
      status => {
        const failure = failWith(status)

        const { error } = intercept(`${environment.apiUrl}/me`)

        expect(notificationServiceMock.showUnavailable).toHaveBeenCalledTimes(1)
        expect(authNavigationServiceMock.sessionExpired).not.toHaveBeenCalled()
        expect(authNavigationServiceMock.forbidden).not.toHaveBeenCalled()
        expect(authNavigationServiceMock.notFound).not.toHaveBeenCalled()
        expect(error).toBe(failure)
      }
    )

    it.each([400, 409, 500])(
      'should only rethrow an error with status %s',
      status => {
        const failure = failWith(status)

        const { error } = intercept(`${environment.apiUrl}/me`)

        expectNoHandling()
        expect(error).toBe(failure)
      }
    )
  })
})
