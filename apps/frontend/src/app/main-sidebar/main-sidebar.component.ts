import { AsyncPipe, NgFor } from '@angular/common'
import { Component } from '@angular/core'
import { MatIconModule } from '@angular/material/icon'
import { RouterLink, RouterLinkActive } from '@angular/router'
import { Observable, map } from 'rxjs'

import { CurrentUserService } from 'app/services/current-user.service'
import { MenuItem, visibleItems } from './menu-items'

@Component({
  selector: 'tails-main-sidebar',
  standalone: true,
  imports: [AsyncPipe, NgFor, MatIconModule, RouterLink, RouterLinkActive],
  templateUrl: './main-sidebar.component.html',
  styleUrls: ['./main-sidebar.component.css']
})
export class MainSidebarComponent {
  readonly items$: Observable<MenuItem[]>

  constructor(currentUser: CurrentUserService) {
    this.items$ = currentUser.me$.pipe(map(visibleItems))
  }
}
