import { Component } from '@angular/core'
import { MatButtonModule } from '@angular/material/button'
import { Router } from '@angular/router'

import { MESSAGES } from 'app/services/session.model'

@Component({
  selector: 'tails-unavailable',
  standalone: true,
  imports: [MatButtonModule],
  templateUrl: './unavailable.component.html',
  styleUrls: ['./unavailable.component.css', '../auth.base.css']
})
export class UnavailableComponent {
  readonly message = MESSAGES.unavailable

  constructor(private router: Router) {}

  retry(): void {
    this.router.navigateByUrl('/')
  }
}
