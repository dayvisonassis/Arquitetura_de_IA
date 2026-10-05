import { Injectable } from '@angular/core'
import { MatSnackBar } from '@angular/material/snack-bar'

import { MESSAGES } from './session.model'

@Injectable({ providedIn: 'root' })
export class NotificationService {
  constructor(private snackBar: MatSnackBar) {}

  showUnavailable(): void {
    this.snackBar.open(MESSAGES.unavailable, 'Fechar', { duration: 6000 })
  }
}
