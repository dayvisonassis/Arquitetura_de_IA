import { Component } from '@angular/core'
import { MatCardModule } from '@angular/material/card'
import { RouterOutlet } from '@angular/router'

@Component({
  selector: 'tails-auth',
  standalone: true,
  imports: [MatCardModule, RouterOutlet],
  templateUrl: './auth.component.html',
  styleUrls: ['./auth.component.css']
})
export class AuthComponent {}
