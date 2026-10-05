import { Routes } from '@angular/router'

import { AuthComponent } from './auth/auth.component'
import {
  authGuard,
  landingGuard,
  loginGuard,
  permissionGuard,
  platformAdminGuard
} from './guards/auth.guard'
import { LayoutComponent } from './layout/layout.component'

const placeholder = () =>
  import('./placeholder/placeholder.component').then(
    m => m.PlaceholderComponent
  )

export const routes: Routes = [
  {
    path: 'login',
    component: AuthComponent,
    children: [
      {
        path: '',
        canActivate: [loginGuard],
        loadComponent: () =>
          import('./auth/sign-in/sign-in.component').then(
            m => m.SignInComponent
          )
      }
    ]
  },
  {
    path: 'unavailable',
    component: AuthComponent,
    children: [
      {
        path: '',
        loadComponent: () =>
          import('./auth/unavailable/unavailable.component').then(
            m => m.UnavailableComponent
          )
      }
    ]
  },
  {
    path: '',
    component: LayoutComponent,
    canActivate: [authGuard],
    children: [
      {
        path: '',
        pathMatch: 'full',
        canActivate: [landingGuard],
        children: []
      },
      {
        path: 'domains',
        canActivate: [platformAdminGuard],
        loadComponent: placeholder,
        data: {
          title: 'Domínios',
          breadcrumbs: [
            { iconClass: 'domain', alias: 'Domínios', url: '/domains' }
          ]
        }
      },
      {
        path: 'users',
        canActivate: [permissionGuard],
        loadComponent: placeholder,
        data: {
          permission: 'users.read',
          title: 'Usuários',
          breadcrumbs: [
            { iconClass: 'group', alias: 'Usuários', url: '/users' }
          ]
        }
      },
      {
        path: 'playground',
        canActivate: [permissionGuard],
        loadComponent: placeholder,
        data: {
          permission: 'playground.read',
          title: 'Playground',
          breadcrumbs: [
            { iconClass: 'chat', alias: 'Playground', url: '/playground' }
          ]
        }
      },
      {
        path: 'forbidden',
        loadComponent: () =>
          import('./forbidden/forbidden.component').then(
            m => m.ForbiddenComponent
          )
      },
      {
        path: 'not-found',
        loadComponent: () =>
          import('./not-found/not-found.component').then(
            m => m.NotFoundComponent
          )
      },
      {
        path: '**',
        loadComponent: () =>
          import('./not-found/not-found.component').then(
            m => m.NotFoundComponent
          )
      }
    ]
  }
]
