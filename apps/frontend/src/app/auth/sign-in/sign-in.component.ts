import { NgIf } from '@angular/common'
import { HttpErrorResponse } from '@angular/common/http'
import { Component, OnInit } from '@angular/core'
import {
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  Validators
} from '@angular/forms'
import { MatButtonModule } from '@angular/material/button'
import { MatFormFieldModule } from '@angular/material/form-field'
import { MatIconModule } from '@angular/material/icon'
import { MatInputModule } from '@angular/material/input'
import { Router } from '@angular/router'
import { finalize, switchMap } from 'rxjs'

import { CurrentUserService } from 'app/services/current-user.service'
import { MESSAGES } from 'app/services/session.model'
import { SignInService } from './sign-in.service'

@Component({
  selector: 'tails-sign-in',
  standalone: true,
  imports: [
    NgIf,
    ReactiveFormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule
  ],
  templateUrl: './sign-in.component.html',
  styleUrls: ['./sign-in.component.css', '../auth.base.css']
})
export class SignInComponent implements OnInit {
  readonly form = new FormGroup({
    email: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required]
    }),
    password: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required]
    })
  })

  submitting = false
  passwordVisible = false
  errorMessage: string | null = null
  infoMessage: string | null = null

  constructor(
    private signIn: SignInService,
    private currentUser: CurrentUserService,
    private router: Router
  ) {}

  ngOnInit(): void {
    const state = window.history.state as { message?: unknown } | null
    this.infoMessage = typeof state?.message === 'string' ? state.message : null
  }

  submit(): void {
    if (this.form.invalid || this.submitting) {
      return
    }
    this.submitting = true
    this.errorMessage = null
    this.infoMessage = null
    const { email, password } = this.form.getRawValue()
    this.signIn
      .login(email, password)
      .pipe(
        switchMap(() => this.currentUser.load()),
        finalize(() => {
          this.submitting = false
        })
      )
      .subscribe({
        next: me =>
          this.router.navigateByUrl(this.currentUser.landingRoute(me)),
        error: (error: HttpErrorResponse) => {
          this.errorMessage = this.messageFor(error)
        }
      })
  }

  private messageFor(error: HttpErrorResponse): string {
    const message = error.error?.message
    return error.status !== 0 && typeof message === 'string'
      ? message
      : MESSAGES.unavailable
  }
}
