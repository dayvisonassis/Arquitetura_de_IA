import { Component } from '@angular/core'
import { RouterOutlet } from '@angular/router'

import { MainHeaderComponent } from 'app/main-header/main-header.component'
import { MainSidebarComponent } from 'app/main-sidebar/main-sidebar.component'

@Component({
  selector: 'tails-layout',
  standalone: true,
  imports: [MainHeaderComponent, MainSidebarComponent, RouterOutlet],
  templateUrl: './layout.component.html',
  styleUrls: ['./layout.component.css']
})
export class LayoutComponent {}
