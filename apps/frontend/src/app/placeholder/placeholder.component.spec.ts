import { NO_ERRORS_SCHEMA } from '@angular/core'
import { ComponentFixture, TestBed } from '@angular/core/testing'
import { By } from '@angular/platform-browser'
import { ActivatedRoute, provideRouter } from '@angular/router'
import { BehaviorSubject } from 'rxjs'

import { BreadcrumbsComponent } from 'app/breadcrumbs/breadcrumbs.component'
import { Breadcrumb } from 'app/breadcrumbs/breadcrumbs.model'
import { PlaceholderComponent } from './placeholder.component'

const NOTICE = 'Esta tela chega numa próxima versão.'

interface RouteData {
  title: string
  breadcrumbs: Breadcrumb[]
}

describe('PlaceholderComponent', () => {
  let fixture: ComponentFixture<PlaceholderComponent> | null = null
  let data$: BehaviorSubject<RouteData>

  const element = (): HTMLElement => fixture!.nativeElement

  const breadcrumbsInput = (): Breadcrumb[] =>
    fixture!.debugElement.query(By.directive(BreadcrumbsComponent))
      .componentInstance.breadcrumbs

  beforeEach(async () => {
    if (fixture) {
      fixture.destroy()
      fixture = null
    }
    TestBed.resetTestingModule()
    jest.clearAllMocks()
    data$ = new BehaviorSubject<RouteData>({
      title: 'Usuários',
      breadcrumbs: [{ iconClass: 'group', alias: 'Usuários', url: '/users' }]
    })
    await TestBed.configureTestingModule({
      imports: [PlaceholderComponent],
      providers: [
        provideRouter([]),
        { provide: ActivatedRoute, useValue: { data: data$ } }
      ],
      schemas: [NO_ERRORS_SCHEMA]
    }).compileComponents()
    fixture = TestBed.createComponent(PlaceholderComponent)
    fixture.detectChanges()
  })

  afterEach(() => {
    try {
      fixture?.destroy()
    } catch {
      // The fixture may already be destroyed
    }
    fixture = null
    data$.complete()
  })

  it('should render the title from the route data', () => {
    expect(
      element().querySelector('.content-header h1')?.textContent?.trim()
    ).toBe('Usuários')
  })

  it('should pass the breadcrumbs from the route data to the trail', () => {
    expect(breadcrumbsInput()).toEqual([
      { iconClass: 'group', alias: 'Usuários', url: '/users' }
    ])
  })

  it('should show the upcoming screen notice in the empty state', () => {
    expect(
      element()
        .querySelector('.empty-state .empty-state-title')
        ?.textContent?.trim()
    ).toBe(NOTICE)
    expect(
      element().querySelector('.empty-state mat-icon')?.textContent?.trim()
    ).toBe('construction')
  })

  it('should update the title and the breadcrumbs when the route data changes', () => {
    data$.next({
      title: 'Domínios',
      breadcrumbs: [{ iconClass: 'domain', alias: 'Domínios', url: '/domains' }]
    })
    fixture!.detectChanges()

    expect(fixture!.componentInstance.title).toBe('Domínios')
    expect(
      element().querySelector('.content-header h1')?.textContent?.trim()
    ).toBe('Domínios')
    expect(breadcrumbsInput()).toEqual([
      { iconClass: 'domain', alias: 'Domínios', url: '/domains' }
    ])
  })
})
