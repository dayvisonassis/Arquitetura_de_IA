import { registerLocaleData } from '@angular/common'
import localePt from '@angular/common/locales/pt'
import { enableProdMode, LOCALE_ID } from '@angular/core'
import { bootstrapApplication } from '@angular/platform-browser'
import { provideRouter } from '@angular/router'

import { AppComponent } from './app/app.component'
import { routes } from './app/app-routing'
import { environment } from './environments/environment'

registerLocaleData(localePt)

if (environment.production) {
  enableProdMode()
}

bootstrapApplication(AppComponent, {
  providers: [provideRouter(routes), { provide: LOCALE_ID, useValue: 'pt-BR' }]
}).catch(err => console.error(err))
