import { HttpClient } from '@angular/common/http'
import { Injectable } from '@angular/core'
import { Observable, catchError, map, of, tap } from 'rxjs'

import { StoredSession } from 'app/services/session.model'
import { environment } from 'environments/environment'

const STORAGE_KEY = 'currentUser'

@Injectable({ providedIn: 'root' })
export class SignInService {
  constructor(private http: HttpClient) {}

  login(email: string, password: string): Observable<StoredSession> {
    return this.http
      .post<StoredSession>(`${environment.apiUrl}/auth/login`, {
        email,
        password
      })
      .pipe(
        tap(session =>
          localStorage.setItem(
            STORAGE_KEY,
            JSON.stringify({
              token: session.token,
              expires_at: session.expires_at
            })
          )
        )
      )
  }

  logout(): Observable<void> {
    return this.http.post<void>(`${environment.apiUrl}/auth/logout`, {}).pipe(
      map(() => undefined),
      catchError(() => of(undefined)),
      tap(() => this.clearSession())
    )
  }

  getSession(): StoredSession | null {
    try {
      const session = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null')
      return session?.token ? session : null
    } catch {
      return null
    }
  }

  getToken(): string | null {
    return this.getSession()?.token ?? null
  }

  isSessionExpired(): boolean {
    const expiresAt = Date.parse(this.getSession()?.expires_at ?? '')
    return Number.isNaN(expiresAt) || expiresAt <= Date.now()
  }

  clearSession(): void {
    localStorage.removeItem(STORAGE_KEY)
  }
}
