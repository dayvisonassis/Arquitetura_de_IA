module.exports = {
  forbidden: [
    {
      name: 'no-cross-app',
      severity: 'error',
      comment:
        'An app imports only its own files, its node_modules and contracts/: apps talk to each other over HTTP (PRD F01).',
      from: { path: '^apps/([^/]+)/' },
      to: {
        dependencyTypesNot: ['core'],
        couldNotResolve: false,
        pathNot: ['^apps/$1/', '^contracts/']
      }
    },
    {
      name: 'not-to-unresolvable',
      severity: 'error',
      comment: 'Every import resolves to a file or an installed package.',
      from: {},
      to: { couldNotResolve: true }
    },
    {
      name: 'no-circular',
      severity: 'error',
      comment: 'No import cycles.',
      from: {},
      to: { circular: true }
    },
    {
      name: 'src-not-to-tests',
      severity: 'error',
      comment: 'Production code never imports test code.',
      from: { path: '^apps/[^/]+/src/' },
      to: {
        path: ['^apps/[^/]+/(__tests__|tests)/', '\\.(spec|test)\\.[cm]?[jt]s$']
      }
    },
    {
      name: 'backend-models-are-pure',
      severity: 'error',
      comment:
        'Models hold data access only: no controllers, routes or express.',
      from: { path: '^apps/backend/src/(api/v2/)?models/' },
      to: {
        path: [
          '^apps/backend/src/(api/v2/)?(controllers|routes)/',
          '/node_modules/express/'
        ]
      }
    },
    {
      name: 'backend-controllers-not-routes',
      severity: 'error',
      comment: 'Routes wire URLs to controllers, never the other way around.',
      from: { path: '^apps/backend/src/(api/v2/)?controllers/' },
      to: { path: '^apps/backend/src/(api/v2/)?routes/' }
    },
    {
      name: 'backend-routes-only-wire',
      severity: 'error',
      comment:
        'A route links URL -> permission -> controller; it does not reach models or services.',
      from: { path: '^apps/backend/src/(api/v2/)?routes/' },
      to: { path: '^apps/backend/src/(api/v2/)?(models|services)/' }
    },
    {
      name: 'services-not-http-layer',
      severity: 'error',
      comment: 'Services do not depend on controllers or routes.',
      from: { path: '^apps/([^/]+)/src/(api/v2/)?services/' },
      to: { path: '^apps/$1/src/(api/v2/)?(controllers|routes)/' }
    },
    {
      name: 'ia-controllers-not-routes',
      severity: 'error',
      comment: 'Routes wire URLs to controllers, never the other way around.',
      from: { path: '^apps/(ia|ia_simulator)/src/controllers/' },
      to: { path: '^apps/$1/src/routes/' }
    }
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    exclude: { path: '(^|/)(node_modules|dist|coverage|\\.angular)/' },
    tsPreCompilationDeps: true,
    moduleSystems: ['es6', 'cjs'],
    enhancedResolveOptions: {
      conditionNames: ['import', 'require', 'node', 'default'],
      exportsFields: ['exports']
    }
  }
}
