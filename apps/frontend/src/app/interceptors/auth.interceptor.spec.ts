import {
  HttpEvent,
  HttpHandlerFn,
  HttpRequest,
  HttpResponse
} from '@angular/common/http'
import { TestBed } from '@angular/core/testing'
import { Observable, Subscription, of } from 'rxjs'

import { SignInService } from 'app/auth/sign-in/sign-in.service'
import { environment } from 'environments/environment'
import { authInterceptor } from './auth.interceptor'

describe('authInterceptor', () => {
  let signInServiceMock: { getToken: jest.Mock }
  let next: jest.Mock<Observable<HttpEvent<unknown>>, [HttpRequest<unknown>]>
  let subscriptions: Subscription[]

  const intercept = (url: string): HttpRequest<unknown> => {
    const request = new HttpRequest('GET', url)
    subscriptions.push(
      TestBed.runInInjectionContext(() =>
        authInterceptor(request, next as unknown as HttpHandlerFn)
      ).subscribe()
    )
    return request
  }

  const forwardedRequest = (): HttpRequest<unknown> => next.mock.calls[0][0]

  beforeEach(() => {
    TestBed.resetTestingModule()
    jest.clearAllMocks()
    subscriptions = []
    signInServiceMock = { getToken: jest.fn() }
    next = jest.fn(
      (_request: HttpRequest<unknown>): Observable<HttpEvent<unknown>> =>
        of(new HttpResponse({ status: 200 }))
    )
    TestBed.configureTestingModule({
      providers: [{ provide: SignInService, useValue: signInServiceMock }]
    })
  })

  afterEach(() => {
    subscriptions.forEach(subscription => subscription.unsubscribe())
  })

  it('should add the Bearer token to an API request when a token exists', () => {
    signInServiceMock.getToken.mockReturnValue('jwt-token')

    const request = intercept(`${environment.apiUrl}/me`)

    expect(next).toHaveBeenCalledTimes(1)
    expect(forwardedRequest()).not.toBe(request)
    expect(forwardedRequest().headers.get('Authorization')).toBe(
      'Bearer jwt-token'
    )
    expect(forwardedRequest().url).toBe(`${environment.apiUrl}/me`)
  })

  it('should forward the original API request when there is no token', () => {
    signInServiceMock.getToken.mockReturnValue(null)

    const request = intercept(`${environment.apiUrl}/me`)

    expect(signInServiceMock.getToken).toHaveBeenCalledTimes(1)
    expect(forwardedRequest()).toBe(request)
    expect(forwardedRequest().headers.has('Authorization')).toBe(false)
  })

  it('should not add the token to a request outside the API', () => {
    signInServiceMock.getToken.mockReturnValue('jwt-token')

    const request = intercept('https://cdn.example.com/asset.json')

    expect(signInServiceMock.getToken).not.toHaveBeenCalled()
    expect(forwardedRequest()).toBe(request)
    expect(forwardedRequest().headers.has('Authorization')).toBe(false)
  })

  it('should return the response of the next handler', done => {
    signInServiceMock.getToken.mockReturnValue('jwt-token')
    const response = new HttpResponse({ status: 200, body: { ok: true } })
    next.mockReturnValue(of(response))

    TestBed.runInInjectionContext(() =>
      authInterceptor(
        new HttpRequest('GET', `${environment.apiUrl}/me`),
        next as unknown as HttpHandlerFn
      )
    ).subscribe(event => {
      expect(event).toBe(response)
      done()
    })
  })
})
