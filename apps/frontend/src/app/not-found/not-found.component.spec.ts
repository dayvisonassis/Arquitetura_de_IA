import { NO_ERRORS_SCHEMA } from '@angular/core'
import { ComponentFixture, TestBed } from '@angular/core/testing'

import { NotFoundComponent } from './not-found.component'

const NOT_FOUND = 'Página não encontrada.'

describe('NotFoundComponent', () => {
  let fixture: ComponentFixture<NotFoundComponent> | null = null

  const element = (): HTMLElement => fixture!.nativeElement

  beforeEach(async () => {
    if (fixture) {
      fixture.destroy()
      fixture = null
    }
    TestBed.resetTestingModule()
    jest.clearAllMocks()
    await TestBed.configureTestingModule({
      imports: [NotFoundComponent],
      schemas: [NO_ERRORS_SCHEMA]
    }).compileComponents()
    fixture = TestBed.createComponent(NotFoundComponent)
    fixture.detectChanges()
  })

  afterEach(() => {
    try {
      fixture?.destroy()
    } catch {
      // The fixture may already be destroyed
    }
    fixture = null
  })

  it('should render the not found title', () => {
    expect(
      element().querySelector('.content-header h1')?.textContent?.trim()
    ).toBe('Página não encontrada')
  })

  it('should render the not found message and the hint in the empty state', () => {
    expect(
      element()
        .querySelector('.empty-state .empty-state-title')
        ?.textContent?.trim()
    ).toBe(NOT_FOUND)
    expect(
      element()
        .querySelector('.empty-state .empty-state-subtitle')
        ?.textContent?.trim()
    ).toBe('Confira o endereço ou use o menu.')
    expect(
      element().querySelector('.empty-state mat-icon')?.textContent?.trim()
    ).toBe('search_off')
  })
})
