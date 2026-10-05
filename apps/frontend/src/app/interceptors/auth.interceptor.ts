import { HttpInterceptorFn } from '@angular/common/http'
import { inject } from '@angular/core'

import { SignInService } from 'app/auth/sign-in/sign-in.service'
import { environment } from 'environments/environment'

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  if (!req.url.startsWith(environment.apiUrl)) {
    return next(req)
  }
  const token = inject(SignInService).getToken()
  return next(
    token
      ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } })
      : req
  )
}
