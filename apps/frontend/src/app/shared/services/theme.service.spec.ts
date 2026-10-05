const localStorageStore: Record<string, string> = {}
const localStorageMock = {
  getItem: jest.fn((key: string) =>
    key in localStorageStore ? localStorageStore[key] : null
  ),
  setItem: jest.fn((key: string, value: string) => {
    localStorageStore[key] = String(value)
  }),
  removeItem: jest.fn((key: string) => {
    delete localStorageStore[key]
  }),
  clear: jest.fn(() => {
    Object.keys(localStorageStore).forEach(key => {
      delete localStorageStore[key]
    })
  })
}
Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
  configurable: true,
  writable: true
})

import { Subscription } from 'rxjs'

import { ThemeService } from './theme.service'

const LIGHT_CLASS = 'theme-default'
const DARK_CLASS = 'theme-default-dark'
const DARK_QUERY = '(prefers-color-scheme: dark)'

describe('ThemeService', () => {
  let body: HTMLElement
  let matchMediaMock: jest.Mock
  let subscriptions: Subscription[]

  const buildDocument = (
    defaultView: unknown = { matchMedia: matchMediaMock }
  ): Document => ({ body, defaultView }) as unknown as Document

  const prefersDark = (matches: boolean): void => {
    matchMediaMock.mockReturnValue({ matches })
  }

  const currentValue = (service: ThemeService): boolean => {
    let value = false
    subscriptions.push(
      service.isDarkMode$.subscribe(dark => {
        value = dark
      })
    )
    return value
  }

  beforeEach(() => {
    jest.clearAllMocks()
    localStorageMock.clear()
    subscriptions = []
    body = document.createElement('body')
    matchMediaMock = jest.fn(() => ({ matches: false }))
  })

  afterEach(() => {
    subscriptions.forEach(subscription => subscription.unsubscribe())
  })

  describe('initial preference', () => {
    it('should use a stored dark theme even when the system prefers light', () => {
      localStorageStore['theme'] = 'dark'
      prefersDark(false)

      const service = new ThemeService(buildDocument())

      expect(currentValue(service)).toBe(true)
      expect(localStorageMock.getItem).toHaveBeenCalledWith('theme')
      expect(matchMediaMock).not.toHaveBeenCalled()
    })

    it('should use a stored light theme even when the system prefers dark', () => {
      localStorageStore['theme'] = 'light'
      prefersDark(true)

      const service = new ThemeService(buildDocument())

      expect(currentValue(service)).toBe(false)
      expect(matchMediaMock).not.toHaveBeenCalled()
    })

    it('should follow the system dark preference when nothing is stored', () => {
      prefersDark(true)

      const service = new ThemeService(buildDocument())

      expect(currentValue(service)).toBe(true)
      expect(matchMediaMock).toHaveBeenCalledWith(DARK_QUERY)
    })

    it('should follow the system light preference when nothing is stored', () => {
      prefersDark(false)

      const service = new ThemeService(buildDocument())

      expect(currentValue(service)).toBe(false)
      expect(matchMediaMock).toHaveBeenCalledWith(DARK_QUERY)
    })

    it('should ignore an unknown stored value and follow the system', () => {
      localStorageStore['theme'] = 'blue'
      prefersDark(true)

      const service = new ThemeService(buildDocument())

      expect(currentValue(service)).toBe(true)
    })

    it('should fall back to light when matchMedia is not available', () => {
      const service = new ThemeService(buildDocument({}))

      expect(currentValue(service)).toBe(false)
    })

    it('should fall back to light when the document has no window', () => {
      const service = new ThemeService(buildDocument(null))

      expect(currentValue(service)).toBe(false)
    })

    it('should apply the dark body class on creation', () => {
      localStorageStore['theme'] = 'dark'

      new ThemeService(buildDocument())

      expect(body.classList.contains(DARK_CLASS)).toBe(true)
      expect(body.classList.contains(LIGHT_CLASS)).toBe(false)
    })

    it('should apply the light body class on creation', () => {
      localStorageStore['theme'] = 'light'

      new ThemeService(buildDocument())

      expect(body.classList.contains(LIGHT_CLASS)).toBe(true)
      expect(body.classList.contains(DARK_CLASS)).toBe(false)
    })
  })

  describe('toggle', () => {
    it('should switch from light to dark, persist the choice and swap the body classes', () => {
      localStorageStore['theme'] = 'light'
      const service = new ThemeService(buildDocument())

      service.toggle()

      expect(localStorageMock.setItem).toHaveBeenCalledWith('theme', 'dark')
      expect(localStorageStore['theme']).toBe('dark')
      expect(body.classList.contains(DARK_CLASS)).toBe(true)
      expect(body.classList.contains(LIGHT_CLASS)).toBe(false)
      expect(currentValue(service)).toBe(true)
    })

    it('should switch back to light on a second toggle', () => {
      localStorageStore['theme'] = 'light'
      const service = new ThemeService(buildDocument())

      service.toggle()
      service.toggle()

      expect(localStorageMock.setItem).toHaveBeenLastCalledWith(
        'theme',
        'light'
      )
      expect(localStorageStore['theme']).toBe('light')
      expect(body.classList.contains(LIGHT_CLASS)).toBe(true)
      expect(body.classList.contains(DARK_CLASS)).toBe(false)
      expect(currentValue(service)).toBe(false)
    })

    it('should emit every change on isDarkMode$', () => {
      prefersDark(true)
      const service = new ThemeService(buildDocument())
      const emitted: boolean[] = []
      subscriptions.push(
        service.isDarkMode$.subscribe(dark => emitted.push(dark))
      )

      service.toggle()
      service.toggle()

      expect(emitted).toEqual([true, false, true])
    })
  })
})
