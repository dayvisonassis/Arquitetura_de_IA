import { Component } from '@angular/core'
import { MatIconModule } from '@angular/material/icon'

@Component({
  selector: 'tails-not-found',
  standalone: true,
  imports: [MatIconModule],
  templateUrl: './not-found.component.html',
  styleUrls: ['./not-found.component.css']
})
export class NotFoundComponent {}
