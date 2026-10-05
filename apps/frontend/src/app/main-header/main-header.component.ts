import { AsyncPipe, NgIf } from '@angular/common'
import { Component } from '@angular/core'
import { MatButtonModule } from '@angular/material/button'
import { MatIconModule } from '@angular/material/icon'
import { Router } from '@angular/router'

import { SignInService } from 'app/auth/sign-in/sign-in.service'
import { CurrentUserService } from 'app/services/current-user.service'
import { MESSAGES, Me, ROLE_LABELS } from 'app/services/session.model'
import { ThemeService } from 'app/shared/services/theme.service'

@Component({
  selector: 'tails-main-header',
  standalone: true,
  imports: [AsyncPipe, NgIf, MatButtonModule, MatIconModule],
  templateUrl: './main-header.component.html',
  styleUrls: ['./main-header.component.css']
})
export class MainHeaderComponent {
  readonly me$
  readonly isDarkMode$

  constructor(
    private currentUser: CurrentUserService,
    private signIn: SignInService,
    private theme: ThemeService,
    private router: Router
  ) {
    this.me$ = currentUser.me$
    this.isDarkMode$ = theme.isDarkMode$
  }

  roleLabel(me: Me): string {
    return ROLE_LABELS[me.role]
  }

  domainLabel(me: Me): string {
    return me.domain?.name ?? 'Plataforma'
  }

  toggleTheme(): void {
    this.theme.toggle()
  }

  logout(): void {
    this.signIn.logout().subscribe(() => {
      this.currentUser.clear()
      this.router.navigate(['/login'], {
        state: { message: MESSAGES.signedOut }
      })
    })
  }
}
