import { HttpClient } from '@angular/common/http'
import { Injectable } from '@angular/core'
import {
  BehaviorSubject,
  Observable,
  finalize,
  of,
  shareReplay,
  tap
} from 'rxjs'

import { environment } from 'environments/environment'
import { LANDING_ROUTES, Me } from './session.model'

@Injectable({ providedIn: 'root' })
export class CurrentUserService {
  private readonly meSubject = new BehaviorSubject<Me | null>(null)
  private pending: Observable<Me> | null = null

  readonly me$ = this.meSubject.asObservable()

  constructor(private http: HttpClient) {}

  load(): Observable<Me> {
    return this.http
      .get<Me>(`${environment.apiUrl}/me`)
      .pipe(tap(me => this.meSubject.next(me)))
  }

  ensureLoaded(): Observable<Me> {
    if (this.meSubject.value) {
      return of(this.meSubject.value)
    }
    this.pending ??= this.load().pipe(
      finalize(() => {
        this.pending = null
      }),
      shareReplay({ bufferSize: 1, refCount: false })
    )
    return this.pending
  }

  landingRoute(me: Me | null = this.meSubject.value): string {
    return me ? LANDING_ROUTES[me.role] : '/login'
  }

  clear(): void {
    this.meSubject.next(null)
  }
}
