import { NO_ERRORS_SCHEMA } from '@angular/core'
import { ComponentFixture, TestBed } from '@angular/core/testing'
import { provideRouter } from '@angular/router'

import { AuthComponent } from './auth.component'

describe('AuthComponent', () => {
  let fixture: ComponentFixture<AuthComponent> | null = null

  beforeEach(async () => {
    if (fixture) {
      fixture.destroy()
      fixture = null
    }
    TestBed.resetTestingModule()
    jest.clearAllMocks()
    await TestBed.configureTestingModule({
      imports: [AuthComponent],
      providers: [provideRouter([])],
      schemas: [NO_ERRORS_SCHEMA]
    }).compileComponents()
    fixture = TestBed.createComponent(AuthComponent)
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

  it('should create the component', () => {
    expect(fixture!.componentInstance).toBeTruthy()
  })

  it('should render the router outlet inside the card of the auth page', () => {
    const element: HTMLElement = fixture!.nativeElement

    expect(
      element.querySelector('.auth-page mat-card.auth-card router-outlet')
    ).not.toBeNull()
  })
})
