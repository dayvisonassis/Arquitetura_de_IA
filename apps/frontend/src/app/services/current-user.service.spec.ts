import { HttpClient, HttpErrorResponse } from '@angular/common/http'
import { Subject, Subscription, of, throwError } from 'rxjs'

import { environment } from 'environments/environment'
import { CurrentUserService } from './current-user.service'
import { Me, Role } from './session.model'

const buildMe = (role: Role, overrides: Partial<Me> = {}): Me => ({
  id: `${role}-id`,
  name: `Name of ${role}`,
  email: `${role}@example.com`,
  role,
  domain: role === 'platform_admin' ? null : { id: 'd1', name: 'Acme' },
  permissions: [],
  ...overrides
})

describe('CurrentUserService', () => {
  let service: CurrentUserService
  let httpClientMock: {
    get: jest.Mock
    post: jest.Mock
    put: jest.Mock
    delete: jest.Mock
  }
  let subscriptions: Subscription[]

  beforeEach(() => {
    jest.clearAllMocks()
    subscriptions = []
    httpClientMock = {
      get: jest.fn(),
      post: jest.fn(),
      put: jest.fn(),
      delete: jest.fn()
    }
    service = new CurrentUserService(httpClientMock as unknown as HttpClient)
  })

  afterEach(() => {
    subscriptions.forEach(subscription => subscription.unsubscribe())
  })

  it('should start without a user', done => {
    subscriptions.push(
      service.me$.subscribe(me => {
        expect(me).toBeNull()
        done()
      })
    )
  })

  describe('load', () => {
    it('should get the current user from the me endpoint and store it', done => {
      const me = buildMe('domain_admin')
      httpClientMock.get.mockReturnValue(of(me))
      const emitted: (Me | null)[] = []
      subscriptions.push(service.me$.subscribe(value => emitted.push(value)))

      service.load().subscribe(loaded => {
        expect(httpClientMock.get).toHaveBeenCalledTimes(1)
        expect(httpClientMock.get).toHaveBeenCalledWith(
          `${environment.apiUrl}/me`
        )
        expect(loaded).toEqual(me)
        expect(emitted).toEqual([null, me])
        done()
      })
    })

    it('should rethrow the error and keep the previous user when the request fails', done => {
      const failure = new HttpErrorResponse({ status: 503 })
      httpClientMock.get.mockReturnValue(throwError(() => failure))

      service.load().subscribe({
        next: () => done.fail('load should not emit'),
        error: error => {
          expect(error).toBe(failure)
          expect(service.landingRoute()).toBe('/login')
          done()
        }
      })
    })
  })

  describe('ensureLoaded', () => {
    it('should return the stored user without a new request', done => {
      const me = buildMe('user')
      httpClientMock.get.mockReturnValue(of(me))
      service.load().subscribe()
      httpClientMock.get.mockClear()

      service.ensureLoaded().subscribe(loaded => {
        expect(loaded).toEqual(me)
        expect(httpClientMock.get).not.toHaveBeenCalled()
        done()
      })
    })

    it('should share one in-flight request between concurrent callers', done => {
      const me = buildMe('platform_admin')
      const response = new Subject<Me>()
      httpClientMock.get.mockReturnValue(response.asObservable())
      const received: Me[] = []

      subscriptions.push(
        service.ensureLoaded().subscribe(value => received.push(value))
      )
      subscriptions.push(
        service.ensureLoaded().subscribe(value => {
          received.push(value)
          expect(httpClientMock.get).toHaveBeenCalledTimes(1)
          expect(received).toEqual([me, me])
          done()
        })
      )
      response.next(me)
      response.complete()
    })

    it('should load the user when nothing is stored', done => {
      const me = buildMe('domain_admin')
      httpClientMock.get.mockReturnValue(of(me))

      service.ensureLoaded().subscribe(loaded => {
        expect(loaded).toEqual(me)
        expect(httpClientMock.get).toHaveBeenCalledTimes(1)
        expect(service.landingRoute()).toBe('/users')
        done()
      })
    })

    it('should retry the request after a failed attempt', done => {
      const me = buildMe('user')
      httpClientMock.get
        .mockReturnValueOnce(
          throwError(() => new HttpErrorResponse({ status: 503 }))
        )
        .mockReturnValueOnce(of(me))

      let firstError: HttpErrorResponse | null = null
      service.ensureLoaded().subscribe({
        next: () => done.fail('the first attempt should fail'),
        error: error => {
          firstError = error
        }
      })
      expect(firstError?.status).toBe(503)

      // The retry happens after the failed attempt has been torn down
      service.ensureLoaded().subscribe(loaded => {
        expect(loaded).toEqual(me)
        expect(httpClientMock.get).toHaveBeenCalledTimes(2)
        done()
      })
    })
  })

  describe('landingRoute', () => {
    it.each([
      { role: 'platform_admin' as Role, route: '/domains' },
      { role: 'domain_admin' as Role, route: '/users' },
      { role: 'user' as Role, route: '/playground' }
    ])('should send $role to $route', ({ role, route }) => {
      expect(service.landingRoute(buildMe(role))).toBe(route)
    })

    it('should use the stored user when no user is given', done => {
      httpClientMock.get.mockReturnValue(of(buildMe('platform_admin')))

      service.load().subscribe(() => {
        expect(service.landingRoute()).toBe('/domains')
        done()
      })
    })

    it('should send to the login without a stored user', () => {
      expect(service.landingRoute()).toBe('/login')
    })

    it('should send to the login when null is given explicitly', () => {
      expect(service.landingRoute(null)).toBe('/login')
    })
  })

  describe('clear', () => {
    it('should remove the stored user and emit null', done => {
      const me = buildMe('domain_admin')
      httpClientMock.get.mockReturnValue(of(me))
      const emitted: (Me | null)[] = []
      subscriptions.push(service.me$.subscribe(value => emitted.push(value)))

      service.load().subscribe(() => {
        service.clear()

        expect(emitted).toEqual([null, me, null])
        expect(service.landingRoute()).toBe('/login')
        done()
      })
    })

    it('should make ensureLoaded request the user again', done => {
      const me = buildMe('user')
      httpClientMock.get.mockReturnValue(of(me))

      service.load().subscribe(() => {
        service.clear()
        service.ensureLoaded().subscribe(() => {
          expect(httpClientMock.get).toHaveBeenCalledTimes(2)
          done()
        })
      })
    })
  })
})
