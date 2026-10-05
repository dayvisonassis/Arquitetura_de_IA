import { NO_ERRORS_SCHEMA } from '@angular/core'
import { ComponentFixture, TestBed } from '@angular/core/testing'
import { provideRouter } from '@angular/router'
import { BehaviorSubject } from 'rxjs'

import { SignInService } from 'app/auth/sign-in/sign-in.service'
import { CurrentUserService } from 'app/services/current-user.service'
import { Me } from 'app/services/session.model'
import { ThemeService } from 'app/shared/services/theme.service'
import { LayoutComponent } from './layout.component'

describe('LayoutComponent', () => {
  let fixture: ComponentFixture<LayoutComponent> | null = null
  let me$: BehaviorSubject<Me | null>
  let isDarkMode$: BehaviorSubject<boolean>

  const element = (): HTMLElement => fixture!.nativeElement

  beforeEach(async () => {
    if (fixture) {
      fixture.destroy()
      fixture = null
    }
    TestBed.resetTestingModule()
    jest.clearAllMocks()
    me$ = new BehaviorSubject<Me | null>(null)
    isDarkMode$ = new BehaviorSubject<boolean>(false)
    await TestBed.configureTestingModule({
      imports: [LayoutComponent],
      providers: [
        provideRouter([]),
        { provide: CurrentUserService, useValue: { me$, clear: jest.fn() } },
        { provide: SignInService, useValue: { logout: jest.fn() } },
        { provide: ThemeService, useValue: { isDarkMode$, toggle: jest.fn() } }
      ],
      schemas: [NO_ERRORS_SCHEMA]
    }).compileComponents()
    fixture = TestBed.createComponent(LayoutComponent)
    fixture.detectChanges()
  })

  afterEach(() => {
    try {
      fixture?.destroy()
    } catch {
      // The fixture may already be destroyed
    }
    fixture = null
    me$.complete()
    isDarkMode$.complete()
  })

  it('should render the header at the top of the shell', () => {
    expect(
      element().querySelector('.app-shell > tails-main-header')
    ).not.toBeNull()
  })

  it('should render the sidebar next to the content', () => {
    expect(
      element().querySelector('.app-shell .app-body > tails-main-sidebar')
    ).not.toBeNull()
  })

  it('should render the router outlet inside the main content', () => {
    expect(
      element().querySelector('.app-body main.app-content router-outlet')
    ).not.toBeNull()
  })
})
