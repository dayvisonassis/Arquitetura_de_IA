import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http'
import { inject } from '@angular/core'
import { catchError, throwError } from 'rxjs'

import { AuthNavigationService } from 'app/services/auth-navigation.service'
import { CurrentUserService } from 'app/services/current-user.service'
import { NotificationService } from 'app/services/notification.service'
import { environment } from 'environments/environment'

const IGNORED_PATHS = ['/auth/login', '/auth/logout']

const handledByCaller = (url: string): boolean =>
  !url.startsWith(environment.apiUrl) ||
  IGNORED_PATHS.some(path => url === `${environment.apiUrl}${path}`)

export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  if (handledByCaller(req.url)) {
    return next(req)
  }
  const navigation = inject(AuthNavigationService)
  const currentUser = inject(CurrentUserService)
  const notifications = inject(NotificationService)
  return next(req).pipe(
    catchError((error: HttpErrorResponse) => {
      if (error.status === 401) {
        navigation.sessionExpired()
      } else if (error.status === 403) {
        currentUser.load().subscribe({
          next: () => navigation.forbidden(),
          error: () => navigation.forbidden()
        })
      } else if (error.status === 404) {
        navigation.notFound()
      } else if (error.status === 503 || error.status === 0) {
        notifications.showUnavailable()
      }
      return throwError(() => error)
    })
  )
}
