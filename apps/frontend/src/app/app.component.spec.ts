import { NO_ERRORS_SCHEMA } from '@angular/core'
import { ComponentFixture, TestBed } from '@angular/core/testing'
import { provideRouter } from '@angular/router'
import { BehaviorSubject } from 'rxjs'

import { AppComponent } from './app.component'
import { ThemeService } from './shared/services/theme.service'

describe('AppComponent', () => {
  let fixture: ComponentFixture<AppComponent> | null = null
  let isDarkMode$: BehaviorSubject<boolean>
  let themeServiceMock: {
    isDarkMode$: BehaviorSubject<boolean>
    toggle: jest.Mock
  }

  beforeEach(async () => {
    if (fixture) {
      fixture.destroy()
      fixture = null
    }
    TestBed.resetTestingModule()
    jest.clearAllMocks()
    isDarkMode$ = new BehaviorSubject<boolean>(false)
    themeServiceMock = { isDarkMode$, toggle: jest.fn() }
    await TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: [
        provideRouter([]),
        { provide: ThemeService, useValue: themeServiceMock }
      ],
      schemas: [NO_ERRORS_SCHEMA]
    }).compileComponents()
    fixture = TestBed.createComponent(AppComponent)
  })

  afterEach(() => {
    try {
      fixture?.destroy()
    } catch {
      // The fixture may already be destroyed
    }
    fixture = null
    isDarkMode$.complete()
  })

  it('should create the root component', () => {
    expect(fixture!.componentInstance).toBeTruthy()
  })

  it('should inject the theme service so the theme is applied on startup', () => {
    expect(fixture!.componentInstance.theme).toBe(themeServiceMock)
    expect(themeServiceMock.toggle).not.toHaveBeenCalled()
  })

  it('should render a router outlet', () => {
    fixture!.detectChanges()

    const element: HTMLElement = fixture!.nativeElement
    expect(element.querySelector('router-outlet')).not.toBeNull()
  })
})
