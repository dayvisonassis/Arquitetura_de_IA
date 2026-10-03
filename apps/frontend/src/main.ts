import { registerLocaleData } from '@angular/common'
import localePt from '@angular/common/locales/pt'
import { LOCALE_ID } from '@angular/core'
import { bootstrapApplication } from '@angular/platform-browser'
import { provideRouter } from '@angular/router'

import { AppComponent } from './app/app.component'
import { routes } from './app/app-routing'

registerLocaleData(localePt)

bootstrapApplication(AppComponent, {
  providers: [provideRouter(routes), { provide: LOCALE_ID, useValue: 'pt-BR' }]
}).catch(err => console.error(err))
