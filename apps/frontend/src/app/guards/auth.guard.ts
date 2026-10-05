import { HttpErrorResponse } from '@angular/common/http'
import { inject } from '@angular/core'
import { CanActivateFn, RedirectCommand, Router } from '@angular/router'
import { catchError, map, of } from 'rxjs'

import { SignInService } from 'app/auth/sign-in/sign-in.service'
import { CurrentUserService } from 'app/services/current-user.service'
import { MESSAGES, Me } from 'app/services/session.model'

const forbiddenRedirect = (router: Router): RedirectCommand =>
  new RedirectCommand(router.parseUrl('/forbidden'), {
    skipLocationChange: true
  })

const unreachable = (error: HttpErrorResponse): boolean =>
  error.status === 0 || error.status === 503

const allowWhen =
  (allowed: (me: Me) => boolean): CanActivateFn =>
  () => {
    const router = inject(Router)
    return inject(CurrentUserService)
      .ensureLoaded()
      .pipe(
        map(me => (allowed(me) ? true : forbiddenRedirect(router))),
        catchError(() => of(false))
      )
  }

export const authGuard: CanActivateFn = () => {
  const signIn = inject(SignInService)
  const currentUser = inject(CurrentUserService)
  const router = inject(Router)
  if (!signIn.getToken()) {
    return router.parseUrl('/login')
  }
  if (signIn.isSessionExpired()) {
    signIn.clearSession()
    currentUser.clear()
    return new RedirectCommand(router.parseUrl('/login'), {
      state: { message: MESSAGES.sessionExpired }
    })
  }
  return currentUser.ensureLoaded().pipe(
    map(() => true),
    catchError((error: HttpErrorResponse) =>
      of(unreachable(error) ? router.parseUrl('/unavailable') : false)
    )
  )
}

export const loginGuard: CanActivateFn = () => {
  const signIn = inject(SignInService)
  const currentUser = inject(CurrentUserService)
  const router = inject(Router)
  if (!signIn.getToken() || signIn.isSessionExpired()) {
    return true
  }
  return currentUser.ensureLoaded().pipe(
    map(me => router.parseUrl(currentUser.landingRoute(me))),
    catchError(() => of(true))
  )
}

export const landingGuard: CanActivateFn = () => {
  const currentUser = inject(CurrentUserService)
  const router = inject(Router)
  return currentUser.ensureLoaded().pipe(
    map(me => router.parseUrl(currentUser.landingRoute(me))),
    catchError(() => of(false))
  )
}

export const permissionGuard: CanActivateFn = (route, state) =>
  allowWhen(me => me.permissions.includes(route.data['permission']))(
    route,
    state
  )

export const platformAdminGuard: CanActivateFn = allowWhen(
  me => me.role === 'platform_admin'
)
