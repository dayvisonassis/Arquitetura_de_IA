import { NO_ERRORS_SCHEMA } from '@angular/core'
import { ComponentFixture, TestBed } from '@angular/core/testing'

import { ForbiddenComponent } from './forbidden.component'

const FORBIDDEN = 'Você não tem permissão para acessar esta página.'

describe('ForbiddenComponent', () => {
  let fixture: ComponentFixture<ForbiddenComponent> | null = null

  const element = (): HTMLElement => fixture!.nativeElement

  beforeEach(async () => {
    if (fixture) {
      fixture.destroy()
      fixture = null
    }
    TestBed.resetTestingModule()
    jest.clearAllMocks()
    await TestBed.configureTestingModule({
      imports: [ForbiddenComponent],
      schemas: [NO_ERRORS_SCHEMA]
    }).compileComponents()
    fixture = TestBed.createComponent(ForbiddenComponent)
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

  it('should render the access denied title', () => {
    expect(
      element().querySelector('.content-header h1')?.textContent?.trim()
    ).toBe('Acesso negado')
  })

  it('should render the forbidden message in the empty state', () => {
    expect(
      element()
        .querySelector('.empty-state .empty-state-title')
        ?.textContent?.trim()
    ).toBe(FORBIDDEN)
    expect(
      element().querySelector('.empty-state mat-icon')?.textContent?.trim()
    ).toBe('block')
  })
})
