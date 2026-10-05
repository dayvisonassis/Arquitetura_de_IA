import { NO_ERRORS_SCHEMA } from '@angular/core'
import { ComponentFixture, TestBed } from '@angular/core/testing'
import { provideRouter } from '@angular/router'

import { BreadcrumbsComponent } from './breadcrumbs.component'
import { Breadcrumb } from './breadcrumbs.model'

describe('BreadcrumbsComponent', () => {
  let fixture: ComponentFixture<BreadcrumbsComponent> | null = null

  const element = (): HTMLElement => fixture!.nativeElement

  const crumbs = (): HTMLAnchorElement[] =>
    Array.from(
      element().querySelectorAll<HTMLAnchorElement>('nav.breadcrumbs a.crumb')
    )

  const separators = (): Element[] =>
    Array.from(element().querySelectorAll('nav.breadcrumbs mat-icon.separator'))

  const render = (breadcrumbs: Breadcrumb[]): void => {
    fixture!.componentRef.setInput('breadcrumbs', breadcrumbs)
    fixture!.detectChanges()
  }

  beforeEach(async () => {
    if (fixture) {
      fixture.destroy()
      fixture = null
    }
    TestBed.resetTestingModule()
    jest.clearAllMocks()
    await TestBed.configureTestingModule({
      imports: [BreadcrumbsComponent],
      providers: [provideRouter([])],
      schemas: [NO_ERRORS_SCHEMA]
    }).compileComponents()
    fixture = TestBed.createComponent(BreadcrumbsComponent)
  })

  afterEach(() => {
    try {
      fixture?.destroy()
    } catch {
      // The fixture may already be destroyed
    }
    fixture = null
  })

  it('should start with an empty trail', () => {
    fixture!.detectChanges()

    expect(fixture!.componentInstance.breadcrumbs).toEqual([])
    expect(crumbs()).toHaveLength(0)
    expect(
      element().querySelector('nav.breadcrumbs')?.getAttribute('aria-label')
    ).toBe('Caminho')
  })

  it('should render a single crumb with its icon, alias and link and no separator', () => {
    render([{ iconClass: 'domain', alias: 'Domínios', url: '/domains' }])

    expect(crumbs()).toHaveLength(1)
    const crumb = crumbs()[0]
    expect(crumb.querySelector('mat-icon')?.textContent?.trim()).toBe('domain')
    expect(crumb.querySelector('span')?.textContent?.trim()).toBe('Domínios')
    expect(crumb.getAttribute('href')).toBe('/domains')
    expect(separators()).toHaveLength(0)
  })

  it('should render a separator between consecutive crumbs only', () => {
    render([
      { iconClass: 'group', alias: 'Usuários', url: '/users' },
      { iconClass: 'person', alias: 'Detail', url: '/users/42' },
      { iconClass: 'edit', alias: 'Edit', url: '/users/42/edit' }
    ])

    expect(crumbs().map(crumb => crumb.getAttribute('href'))).toEqual([
      '/users',
      '/users/42',
      '/users/42/edit'
    ])
    expect(separators()).toHaveLength(2)
    expect(separators()[0].textContent?.trim()).toBe('chevron_right')
  })
})
