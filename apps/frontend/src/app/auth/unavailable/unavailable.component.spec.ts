import { NO_ERRORS_SCHEMA } from '@angular/core'
import { ComponentFixture, TestBed } from '@angular/core/testing'
import { Router } from '@angular/router'

import { UnavailableComponent } from './unavailable.component'

const UNAVAILABLE =
  'Serviço temporariamente indisponível. Tente novamente em instantes.'

describe('UnavailableComponent', () => {
  let fixture: ComponentFixture<UnavailableComponent> | null = null
  let routerMock: { navigateByUrl: jest.Mock }

  const element = (): HTMLElement => fixture!.nativeElement

  beforeEach(async () => {
    if (fixture) {
      fixture.destroy()
      fixture = null
    }
    TestBed.resetTestingModule()
    jest.clearAllMocks()
    routerMock = { navigateByUrl: jest.fn(() => Promise.resolve(true)) }
    await TestBed.configureTestingModule({
      imports: [UnavailableComponent],
      providers: [{ provide: Router, useValue: routerMock }],
      schemas: [NO_ERRORS_SCHEMA]
    }).compileComponents()
    fixture = TestBed.createComponent(UnavailableComponent)
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

  it('should show the title and the unavailability message as an alert', () => {
    expect(element().querySelector('h1.title')?.textContent?.trim()).toBe(
      'AI Gateway'
    )
    expect(
      element()
        .querySelector('p.callout-error[role="alert"]')
        ?.textContent?.trim()
    ).toBe(UNAVAILABLE)
  })

  it('should render the retry button', () => {
    const button = element().querySelector<HTMLButtonElement>(
      'button.btn-primary-green'
    )

    expect(button?.textContent?.trim()).toBe('Tentar novamente')
  })

  it('should go back to the root when the retry button is clicked', () => {
    element()
      .querySelector<HTMLButtonElement>('button.btn-primary-green')!
      .click()

    expect(routerMock.navigateByUrl).toHaveBeenCalledTimes(1)
    expect(routerMock.navigateByUrl).toHaveBeenCalledWith('/')
  })
})
