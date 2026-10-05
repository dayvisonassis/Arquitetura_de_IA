import { Component } from '@angular/core'
import { RouterOutlet } from '@angular/router'

import { ThemeService } from './shared/services/theme.service'

@Component({
  selector: 'tails-root',
  standalone: true,
  imports: [RouterOutlet],
  templateUrl: './app.component.html'
})
export class AppComponent {
  constructor(readonly theme: ThemeService) {}
}
