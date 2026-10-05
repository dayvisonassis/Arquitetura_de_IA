import { Injectable } from '@angular/core'
import { Router } from '@angular/router'

import { SignInService } from 'app/auth/sign-in/sign-in.service'
import { CurrentUserService } from './current-user.service'
import { MESSAGES } from './session.model'

@Injectable({ providedIn: 'root' })
export class AuthNavigationService {
  private redirecting = false

  constructor(
    private router: Router,
    private signIn: SignInService,
    private currentUser: CurrentUserService
  ) {}

  sessionExpired(): void {
    if (this.redirecting) {
      return
    }
    this.redirecting = true
    this.signIn.clearSession()
    this.currentUser.clear()
    this.router
      .navigate(['/login'], { state: { message: MESSAGES.sessionExpired } })
      .finally(() => {
        this.redirecting = false
      })
  }

  forbidden(): void {
    this.router.navigate(['/forbidden'], { skipLocationChange: true })
  }

  notFound(): void {
    this.router.navigate(['/not-found'], { skipLocationChange: true })
  }
}
