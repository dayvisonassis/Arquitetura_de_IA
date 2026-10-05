const localStorageStore: Record<string, string> = {}
const localStorageMock = {
  getItem: jest.fn((key: string) =>
    key in localStorageStore ? localStorageStore[key] : null
  ),
  setItem: jest.fn((key: string, value: string) => {
    localStorageStore[key] = String(value)
  }),
  removeItem: jest.fn((key: string) => {
    delete localStorageStore[key]
  }),
  clear: jest.fn(() => {
    Object.keys(localStorageStore).forEach(key => {
      delete localStorageStore[key]
    })
  })
}
Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
  configurable: true,
  writable: true
})

import { HttpClient, HttpErrorResponse } from '@angular/common/http'
import { of, throwError } from 'rxjs'

import { environment } from 'environments/environment'
import { SignInService } from './sign-in.service'

const STORAGE_KEY = 'currentUser'
const NOW = Date.parse('2026-10-04T12:00:00.000Z')

describe('SignInService', () => {
  let service: SignInService
  let dateNowSpy: jest.SpyInstance
  let httpClientMock: {
    get: jest.Mock
    post: jest.Mock
    put: jest.Mock
    delete: jest.Mock
  }

  const storeSession = (value: unknown): void => {
    localStorageStore[STORAGE_KEY] =
      typeof value === 'string' ? value : JSON.stringify(value)
  }

  beforeEach(() => {
    jest.clearAllMocks()
    localStorageMock.clear()
    dateNowSpy = jest.spyOn(Date, 'now').mockReturnValue(NOW)
    httpClientMock = {
      get: jest.fn(),
      post: jest.fn(),
      put: jest.fn(),
      delete: jest.fn()
    }
    service = new SignInService(httpClientMock as unknown as HttpClient)
  })

  afterEach(() => {
    dateNowSpy.mockRestore()
  })

  describe('login', () => {
    it('should post the credentials to the login endpoint', done => {
      httpClientMock.post.mockReturnValue(
        of({ token: 'jwt-token', expires_at: '2026-10-05T12:00:00.000Z' })
      )

      service.login('ana@example.com', 'secret-password').subscribe(() => {
        expect(httpClientMock.post).toHaveBeenCalledTimes(1)
        expect(httpClientMock.post).toHaveBeenCalledWith(
          `${environment.apiUrl}/auth/login`,
          { email: 'ana@example.com', password: 'secret-password' }
        )
        done()
      })
    })

    it('should store only the token and the expiration under currentUser', done => {
      httpClientMock.post.mockReturnValue(
        of({
          token: 'jwt-token',
          expires_at: '2026-10-05T12:00:00.000Z',
          extra: 'ignored'
        })
      )

      service.login('ana@example.com', 'secret-password').subscribe(session => {
        expect(session.token).toBe('jwt-token')
        expect(localStorageMock.setItem).toHaveBeenCalledWith(
          STORAGE_KEY,
          JSON.stringify({
            token: 'jwt-token',
            expires_at: '2026-10-05T12:00:00.000Z'
          })
        )
        expect(JSON.parse(localStorageStore[STORAGE_KEY])).toEqual({
          token: 'jwt-token',
          expires_at: '2026-10-05T12:00:00.000Z'
        })
        done()
      })
    })

    it('should not store anything and should rethrow when the login fails', done => {
      const failure = new HttpErrorResponse({
        status: 401,
        error: { message: 'Invalid email or password.' }
      })
      httpClientMock.post.mockReturnValue(throwError(() => failure))

      service.login('ana@example.com', 'wrong-password').subscribe({
        next: () => done.fail('login should not emit'),
        error: error => {
          expect(error).toBe(failure)
          expect(localStorageMock.setItem).not.toHaveBeenCalled()
          expect(localStorageStore[STORAGE_KEY]).toBeUndefined()
          done()
        }
      })
    })
  })

  describe('logout', () => {
    it('should post to the logout endpoint, clear the session and complete with undefined', done => {
      storeSession({ token: 'jwt-token', expires_at: '2026-10-05T12:00:00Z' })
      httpClientMock.post.mockReturnValue(of(null))
      const values: unknown[] = []

      service.logout().subscribe({
        next: value => values.push(value),
        error: () => done.fail('logout should not error'),
        complete: () => {
          expect(httpClientMock.post).toHaveBeenCalledWith(
            `${environment.apiUrl}/auth/logout`,
            {}
          )
          expect(values).toEqual([undefined])
          expect(localStorageMock.removeItem).toHaveBeenCalledWith(STORAGE_KEY)
          expect(localStorageStore[STORAGE_KEY]).toBeUndefined()
          done()
        }
      })
    })

    it.each([{ status: 401 }, { status: 503 }, { status: 0 }])(
      'should clear the session and complete with undefined when the logout fails with status $status',
      ({ status }, done) => {
        storeSession({ token: 'jwt-token', expires_at: '2026-10-05T12:00:00Z' })
        httpClientMock.post.mockReturnValue(
          throwError(() => new HttpErrorResponse({ status }))
        )
        const values: unknown[] = []

        service.logout().subscribe({
          next: value => values.push(value),
          error: () => done.fail('logout should swallow the error'),
          complete: () => {
            expect(values).toEqual([undefined])
            expect(localStorageMock.removeItem).toHaveBeenCalledWith(
              STORAGE_KEY
            )
            expect(localStorageStore[STORAGE_KEY]).toBeUndefined()
            done()
          }
        })
      }
    )
  })

  describe('getSession', () => {
    it('should return the stored session', () => {
      storeSession({ token: 'jwt-token', expires_at: '2026-10-05T12:00:00Z' })

      expect(service.getSession()).toEqual({
        token: 'jwt-token',
        expires_at: '2026-10-05T12:00:00Z'
      })
      expect(localStorageMock.getItem).toHaveBeenCalledWith(STORAGE_KEY)
    })

    it('should return null when nothing is stored', () => {
      expect(service.getSession()).toBeNull()
    })

    it('should return null when the stored value is not valid JSON', () => {
      storeSession('{not-json')

      expect(service.getSession()).toBeNull()
    })

    it('should return null when the stored session has no token', () => {
      storeSession({ expires_at: '2026-10-05T12:00:00Z' })

      expect(service.getSession()).toBeNull()
    })

    it('should return null when the stored value is the JSON null literal', () => {
      storeSession('null')

      expect(service.getSession()).toBeNull()
    })
  })

  describe('getToken', () => {
    it('should return the stored token', () => {
      storeSession({ token: 'jwt-token', expires_at: '2026-10-05T12:00:00Z' })

      expect(service.getToken()).toBe('jwt-token')
    })

    it('should return null without a session', () => {
      expect(service.getToken()).toBeNull()
    })
  })

  describe('isSessionExpired', () => {
    it('should be expired without a session', () => {
      expect(service.isSessionExpired()).toBe(true)
    })

    it('should be expired when the expiration is not a valid date', () => {
      storeSession({ token: 'jwt-token', expires_at: 'not-a-date' })

      expect(service.isSessionExpired()).toBe(true)
    })

    it('should be expired when the session has no expiration', () => {
      storeSession({ token: 'jwt-token' })

      expect(service.isSessionExpired()).toBe(true)
    })

    it('should be expired when the expiration is in the past', () => {
      storeSession({ token: 'jwt-token', expires_at: '2026-10-04T11:59:59Z' })

      expect(service.isSessionExpired()).toBe(true)
    })

    it('should be expired when the expiration is exactly now', () => {
      storeSession({ token: 'jwt-token', expires_at: '2026-10-04T12:00:00Z' })

      expect(service.isSessionExpired()).toBe(true)
    })

    it('should not be expired when the expiration is in the future', () => {
      storeSession({ token: 'jwt-token', expires_at: '2026-10-04T12:00:01Z' })

      expect(service.isSessionExpired()).toBe(false)
    })
  })

  describe('clearSession', () => {
    it('should remove currentUser from the storage', () => {
      storeSession({ token: 'jwt-token', expires_at: '2026-10-05T12:00:00Z' })

      service.clearSession()

      expect(localStorageMock.removeItem).toHaveBeenCalledWith(STORAGE_KEY)
      expect(localStorageStore[STORAGE_KEY]).toBeUndefined()
      expect(service.getSession()).toBeNull()
    })
  })
})
