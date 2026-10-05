import { NgFor, NgIf } from '@angular/common'
import { Component, Input } from '@angular/core'
import { MatIconModule } from '@angular/material/icon'
import { RouterLink } from '@angular/router'

import { Breadcrumb } from './breadcrumbs.model'

@Component({
  selector: 'tails-breadcrumbs',
  standalone: true,
  imports: [NgFor, NgIf, MatIconModule, RouterLink],
  templateUrl: './breadcrumbs.component.html',
  styleUrls: ['./breadcrumbs.component.css']
})
export class BreadcrumbsComponent {
  @Input() breadcrumbs: Breadcrumb[] = []
}
