/**
 * Gate `arch` — fronteiras entre os workspaces e entre as camadas MVC do sistema web.
 * Regras complementares (process.env, .listen) ficam em scripts/check-architecture.mjs.
 * @type {import('dependency-cruiser').IConfiguration}
 */
const WEB = '^apps/web/src/';
const WORKSPACE_SRC = '^(apps|services|packages)/[^/]+/src/';

module.exports = {
  forbidden: [
    {
      name: 'no-circular',
      severity: 'error',
      comment: 'Ciclos de import acoplam módulos e quebram a ordem de inicialização.',
      from: {},
      to: { circular: true },
    },

    // Fronteira entre os serviços (PRD, F01): o que é comum fica em packages/.
    {
      name: 'web-not-to-gateway',
      severity: 'error',
      comment: 'O sistema web fala com o proxy só pela API HTTP; o que é comum fica em packages/contract.',
      from: { path: '^apps/' },
      to: { path: '^services/' },
    },
    {
      name: 'gateway-not-to-web',
      severity: 'error',
      comment: 'O proxy não conhece o sistema web; o que é comum fica em packages/contract.',
      from: { path: '^services/' },
      to: { path: '^apps/' },
    },
    {
      name: 'packages-are-leaves',
      severity: 'error',
      comment: 'Um pacote compartilhado não depende de quem o usa.',
      from: { path: '^packages/' },
      to: { path: '^(apps|services)/' },
    },

    // Camadas MVC do sistema web.
    {
      name: 'models-are-pure',
      severity: 'error',
      comment: 'Model não conhece HTTP: não importa controllers, routes, middlewares, app nem express.',
      from: { path: `${WEB}models/` },
      to: { path: [`${WEB}(controllers|routes|middlewares)/`, `${WEB}(app|server)\\.ts$`, 'node_modules/(@types/)?express/'] },
    },
    {
      name: 'controllers-not-routes',
      severity: 'error',
      comment: 'Controller não conhece o roteamento nem a montagem do app.',
      from: { path: `${WEB}controllers/` },
      to: { path: [`${WEB}routes/`, `${WEB}(app|server)\\.ts$`] },
    },
    {
      name: 'routes-only-wire',
      severity: 'error',
      comment: 'Rota só liga URL -> controller; acesso a dados passa pelo controller.',
      from: { path: `${WEB}routes/` },
      to: { path: `${WEB}models/` },
    },

    // Todos os workspaces.
    {
      name: 'not-to-tests',
      severity: 'error',
      comment: 'Código de produção nunca importa código de teste.',
      from: { path: WORKSPACE_SRC },
      to: { path: ['^(apps|services|packages)/[^/]+/tests/', '^tests/'] },
    },
    {
      name: 'no-orphans',
      severity: 'error',
      comment: 'Todo módulo de src/ precisa ser alcançável; server.ts (apps e serviços) e index.ts (pacotes) são os pontos de entrada.',
      from: {
        orphan: true,
        path: WORKSPACE_SRC,
        pathNot: ['^(apps|services)/[^/]+/src/server\\.ts$', '^packages/[^/]+/src/index\\.ts$', '\\.d\\.ts$'],
      },
      to: {},
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    tsConfig: { fileName: 'tsconfig.base.json' },
    tsPreCompilationDeps: true,
    enhancedResolveOptions: { exportsFields: ['exports'], conditionNames: ['import', 'require', 'node', 'default', 'types'] },
  },
};
