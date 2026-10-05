import { DOCUMENT } from '@angular/common'
import { Inject, Injectable } from '@angular/core'
import { BehaviorSubject } from 'rxjs'

const STORAGE_KEY = 'theme'
const LIGHT_CLASS = 'theme-default'
const DARK_CLASS = 'theme-default-dark'

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly darkSubject: BehaviorSubject<boolean>

  readonly isDarkMode$

  constructor(@Inject(DOCUMENT) private document: Document) {
    this.darkSubject = new BehaviorSubject(this.initialPreference())
    this.isDarkMode$ = this.darkSubject.asObservable()
    this.apply(this.darkSubject.value)
  }

  toggle(): void {
    const dark = !this.darkSubject.value
    localStorage.setItem(STORAGE_KEY, dark ? 'dark' : 'light')
    this.darkSubject.next(dark)
    this.apply(dark)
  }

  private initialPreference(): boolean {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored === 'dark' || stored === 'light') {
      return stored === 'dark'
    }
    const view = this.document.defaultView
    return view?.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false
  }

  private apply(dark: boolean): void {
    const body = this.document.body
    body.classList.toggle(DARK_CLASS, dark)
    body.classList.toggle(LIGHT_CLASS, !dark)
  }
}
