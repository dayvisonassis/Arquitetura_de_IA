import { registerLocaleData } from '@angular/common'
import { provideHttpClient, withInterceptors } from '@angular/common/http'
import localePt from '@angular/common/locales/pt'
import { enableProdMode, LOCALE_ID } from '@angular/core'
import { bootstrapApplication } from '@angular/platform-browser'
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async'
import { provideRouter } from '@angular/router'

import { AppComponent } from './app/app.component'
import { routes } from './app/app-routing'
import { authInterceptor } from './app/interceptors/auth.interceptor'
import { errorInterceptor } from './app/interceptors/error.interceptor'
import { environment } from './environments/environment'

registerLocaleData(localePt)

if (environment.production) {
  enableProdMode()
}

bootstrapApplication(AppComponent, {
  providers: [
    provideRouter(routes),
    provideHttpClient(withInterceptors([authInterceptor, errorInterceptor])),
    provideAnimationsAsync(),
    { provide: LOCALE_ID, useValue: 'pt-BR' }
  ]
}).catch(err => console.error(err))
