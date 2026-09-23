/**
 * Gate `arch` — fronteiras das camadas MVC.
 * Regras complementares (process.env, app.listen) ficam em scripts/check-architecture.mjs.
 * @type {import('dependency-cruiser').IConfiguration}
 */
module.exports = {
  forbidden: [
    {
      name: 'no-circular',
      severity: 'error',
      comment: 'Ciclos de import acoplam módulos e quebram a ordem de inicialização.',
      from: {},
      to: { circular: true },
    },
    {
      name: 'models-are-pure',
      severity: 'error',
      comment: 'Model não conhece HTTP: não importa controllers, routes, middlewares, app nem express.',
      from: { path: '^src/models/' },
      to: { path: ['^src/(controllers|routes|middlewares)/', '^src/(app|server)\\.ts$', 'node_modules/(@types/)?express/'] },
    },
    {
      name: 'controllers-not-routes',
      severity: 'error',
      comment: 'Controller não conhece o roteamento nem a montagem do app.',
      from: { path: '^src/controllers/' },
      to: { path: ['^src/routes/', '^src/(app|server)\\.ts$'] },
    },
    {
      name: 'routes-only-wire',
      severity: 'error',
      comment: 'Rota só liga URL -> controller; acesso a dados passa pelo controller.',
      from: { path: '^src/routes/' },
      to: { path: '^src/models/' },
    },
    {
      name: 'not-to-tests',
      severity: 'error',
      comment: 'Código de produção nunca importa código de teste.',
      from: { path: '^src/' },
      to: { path: '^tests/' },
    },
    {
      name: 'no-orphans',
      severity: 'error',
      comment: 'Todo módulo de src/ precisa ser alcançável; server.ts é o ponto de entrada.',
      from: { orphan: true, path: '^src/', pathNot: ['^src/server\\.ts$', '\\.d\\.ts$'] },
      to: {},
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    tsConfig: { fileName: 'tsconfig.json' },
    tsPreCompilationDeps: true,
    enhancedResolveOptions: { exportsFields: ['exports'], conditionNames: ['import', 'require', 'node', 'default', 'types'] },
  },
};
