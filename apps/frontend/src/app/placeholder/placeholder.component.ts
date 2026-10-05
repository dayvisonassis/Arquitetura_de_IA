import { Component, OnInit } from '@angular/core'
import { MatIconModule } from '@angular/material/icon'
import { ActivatedRoute } from '@angular/router'

import { Breadcrumb } from 'app/breadcrumbs/breadcrumbs.model'
import { BreadcrumbsComponent } from 'app/breadcrumbs/breadcrumbs.component'

@Component({
  selector: 'tails-placeholder',
  standalone: true,
  imports: [BreadcrumbsComponent, MatIconModule],
  templateUrl: './placeholder.component.html',
  styleUrls: ['./placeholder.component.css']
})
export class PlaceholderComponent implements OnInit {
  title = ''
  breadcrumbs: Breadcrumb[] = []

  constructor(private activatedRoute: ActivatedRoute) {}

  ngOnInit(): void {
    this.activatedRoute.data.subscribe(({ title, breadcrumbs }) => {
      this.title = title
      this.breadcrumbs = breadcrumbs
    })
  }
}
