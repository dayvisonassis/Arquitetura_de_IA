# Quality Gates

Checagens determinísticas de passa/falha que protegem o projeto. Os `id`s abaixo são os mesmos que o
`spec-writer` declara no `contract.md` de cada feature e que o `implement-feature` e o `evaluator` executam.

## Como rodar

```bash
npm run gate                        # todos, em ordem, parando na primeira falha
npm run gate:lint                   # um gate isolado
node scripts/runGate.mjs lint arch  # um subconjunto (sempre na ordem do registro)
```

Código de saída: `0` = tudo passou · `1` = algum gate falhou · `2` = id de gate desconhecido.

O gate `e2e` precisa do app no ar (ver [O gate `e2e`](#o-gate-e2e)). Com `npm run dev` rodando em outro terminal,
`npm run gate` roda os sete gates.

## Workspaces

O repositório é um monorepo com npm workspaces, na estrutura definida pela F01 do PRD:

| Workspace | Pacote | Estado |
|---|---|---|
| `packages/contract` | `@arquitetura-de-ia/contract` | vazio, implementado a partir da F01 |
| `services/ai-gateway` | `@arquitetura-de-ia/ai-gateway` | vazio, implementado a partir da F01 |
| `apps/web` | `@arquitetura-de-ia/web` | esqueleto MVC (Express + EJS) |

- Os gates por workspace (`typecheck`, `build`, `tests` e as regras do `check-architecture`) rodam em todo
  workspace que tem `src/`. Um workspace sem `src/` aparece na saída como `sem src/ ainda, nada a checar`.
- Cada workspace já tem `tsconfig.json`, `tsconfig.build.json`, `jest.config.js` e as dependências de teste
  (`jest`, `ts-jest`, `@types/jest`). Uma feature só precisa criar `src/` e `tests/`; os gates passam a valer sozinhos.
- A ordem no `package.json` raiz é `packages → services → apps`, para que `npm run build --workspaces`
  compile o contrato antes de quem o usa.
- A lista de workspaces é lida por [scripts/workspaces.mjs](scripts/workspaces.mjs), que só entende padrões no formato `pasta/*`.

## Gates

A ordem vai do mais barato ao mais caro, e os que precisam do app no ar vêm por último:
`typecheck → lint → build → arch → tests → deadcode → e2e`.

| id | O que garante | Comando | Configuração |
|---|---|---|---|
| `typecheck` | Contrato de tipos (strict) | `tsc -p tsconfig.json --noEmit` (raiz) + `tsc -p <ws>/tsconfig.json --noEmit` por workspace | `tsconfig.base.json` (opções comuns), `tsconfig.json` (só a config do runner e `tests/e2e`), `<ws>/tsconfig.json` |
| `lint` | Consistência, **zero warnings** | `eslint . --max-warnings=0` | `eslint.config.mjs` (typescript-eslint `recommendedTypeChecked`) |
| `build` | Cada workspace compila para `<ws>/dist/` | `tsc -p <ws>/tsconfig.build.json` | `<ws>/tsconfig.build.json` |
| `arch` | Fronteiras entre workspaces e camadas MVC | `depcruise <ws>/src <ws>/tests` + `node scripts/check-architecture.mjs` | `.dependency-cruiser.cjs`, `scripts/check-architecture.mjs` |
| `tests` | Comportamento + cobertura mínima de 80% **por workspace** | `jest --coverage -c <ws>/jest.config.js` | `<ws>/jest.config.js` (`coverageThreshold`, provider `v8`) |
| `deadcode` | Arquivos, exports e dependências sem uso | `knip` | `knip.json` (por workspace) |
| `e2e` | Fluxos de usuário num navegador, contra o app no ar | `playwright test --config playwright.e2e.config.ts` | `playwright.e2e.config.ts`, `tests/e2e/` |

### Regras do `arch`

| Regra | Onde é aplicada | Significado |
|---|---|---|
| `no-circular` | dependency-cruiser | nenhum ciclo de import |
| `web-not-to-gateway` | dependency-cruiser | `apps/` não importa `services/`; o sistema web fala com o proxy só pela API HTTP |
| `gateway-not-to-web` | dependency-cruiser | `services/` não importa `apps/` |
| `packages-are-leaves` | dependency-cruiser | `packages/` não importa `apps/` nem `services/` |
| `models-are-pure` | dependency-cruiser | `apps/web/src/models/` não importa controllers, routes, middlewares, `app`/`server` nem `express` |
| `controllers-not-routes` | dependency-cruiser | `apps/web/src/controllers/` não importa `routes/` nem `app`/`server` |
| `routes-only-wire` | dependency-cruiser | `apps/web/src/routes/` não importa `models/`; a rota só liga URL → controller |
| `not-to-tests` | dependency-cruiser | o `src/` de nenhum workspace importa `tests/`, dele ou da raiz |
| `no-orphans` | dependency-cruiser | todo módulo de `src/` precisa ser alcançável a partir de `src/server.ts` (apps e serviços) ou `src/index.ts` (pacotes) |
| `env-only-in-config` | check-architecture | `process.env` só em `<ws>/src/config/env.ts`; em `packages/*`, em lugar nenhum |
| `listen-only-in-server` | check-architecture | `.listen(` só em `<ws>/src/server.ts`, para que o `app.ts` continue testável; em `packages/*`, em lugar nenhum |

As três regras de fronteira olham o caminho **resolvido** do import. Como o npm liga cada workspace em
`node_modules/@arquitetura-de-ia/*` e o dependency-cruiser segue o link até a pasta real, elas pegam tanto
`../../../services/...` quanto `@arquitetura-de-ia/ai-gateway`.

### O gate `e2e`

- **Precisa do app no ar.** O gate não sobe o app. Antes de rodar, ele confere se `E2E_BASE_URL`
  (padrão `http://127.0.0.1:3000`) responde. Se não responder, falha com as instruções para subir:
  `npm run dev` hoje, `docker compose up` depois da F01.
- **Roda headless.** Não abre janela nenhuma. Isso é diferente da execução com navegador visível que um humano
  acompanha num smoke test (`playwright-cli open --headed`, usada pelo `qa-preflight`).
- **Escopo:** roda quando muda algo num workspace, em `tests/e2e/`, em `playwright.e2e.config.ts` ou no
  `package-lock.json`, comparando com `origin/main` (ou `HEAD`, sem remoto) mais os arquivos não rastreados.
  Sem mudança nesses caminhos, é um no-op que passa e avisa.
  - `E2E_FORCE=1` roda mesmo sem mudança.
  - `E2E_SKIP=1` pula o gate com um banner de "não verificado". É a válvula de escape do gate, para uso
    consciente, e não tem relação com proteção anti-bot do app.
- **Sem retry e com 1 worker.** Um gate não pode passar na segunda tentativa. Os testes rodam em série porque
  vão escrever no mesmo banco.
- **Sessões:** um projeto do runner por sessão; a pasta do teste decide com que sessão ele roda. Sem login até a
  F04, só existe o projeto `public` (`tests/e2e/public/`).
- **Semente:** [tests/e2e/public/seed.spec.ts](tests/e2e/public/seed.spec.ts) abre `/` e confere o layout. Ela prova o
  harness, não o produto.
- **Quando falha:** screenshot e trace ficam em `test-results/e2e/` (ignorado pelo Git).
  `npx playwright show-trace <trace.zip>` abre o trace.
- **Subconjunto:** `npm run test:e2e -- --grep "@F07(?![\w-])"` roda só os testes da F07. A âncora evita que `@F07`
  pegue `@F07-v2`.
- **Onde ler o último build do servidor:** hoje, no terminal do `npm run dev` (o `tsx` recompila a cada mudança e
  mostra o erro ali). Depois da F01, em `docker compose logs web`.
- **Os testes escrevem pelo produto** no banco que o app estiver usando: hoje o model em memória, a partir da F01 o
  MySQL. Quem mantém esse banco limpo é a política de dados dos testes, não o gate.
- **Comprovado verde em 2026-10-03.** A semente foi quebrada de propósito, o gate falhou, a semente foi restaurada e o
  gate passou. Desde então o `e2e` faz parte da lista padrão do `npm run gate`.

#### Decisões provisórias e o que ainda está indefinido

- **Provisório:** diretório `tests/e2e/<projeto>/`, um projeto por sessão.
- **Provisório:** nenhuma conta até a F04.
- **Indefinido para o time:** os padrões dos testes de feature, a política de dados e quais contas os testes usam.
- **Quem escreve os testes de feature:** não há `e2e-test-writer` para esta stack (as test-writers instaladas são de
  outro projeto). O `implement-feature` os escreve pelo fallback genérico: um fluxo por arquivo, cada teste marcado com
  `@<feature-id>` e os ids das superfícies do contrato, e a tabela de cobertura em `docs/<feature>/e2e-test.md`.
  Cobertura e2e que faltar vira PENDING no `evaluator`, para um humano.

#### Próximas mudanças no harness (feitas pela `gate-builder`)

| Quando | O que muda |
|---|---|
| F01 concluída | a instrução para subir o app passa a ser `docker compose up`, e o build do servidor passa a ser lido em `docker compose logs web`. O escopo já cobre os três workspaces. |
| F04 concluída | um global setup entra uma vez por papel (`platform_admin`, `domain_admin`, `user`) e guarda a sessão em `tests/e2e/.auth/<papel>.json`, reaproveitada enquanto for válida (8 h). Um projeto do runner e uma semente por papel, as contas `domain_admin` e `user` no mesmo domínio, e uma fixture de API por sessão para criar e remover dados. Nunca repetir login em loop: 5 erros seguidos bloqueiam a conta por 15 minutos. |

### Exceções conscientes

- `knip.json` → `ignoreDependencies: ["ejs"]` em `apps/web`: o EJS é carregado pelo Express via
  `app.set('view engine', 'ejs')`, não por `import`, então o knip não o enxerga.
- `knip.json` → `ignoreExportsUsedInFile: true`: um tipo exportado e usado no próprio arquivo não conta como código morto.
- `<ws>/jest.config.js` → `coverageProvider: 'v8'`: o provider padrão (babel/istanbul) gera caminhos `file:/C:/...` no
  Windows e quebra o relatório lcov.
- `services/ai-gateway` e `packages/contract` declaram `jest`, `ts-jest` e `@types/jest` antes de ter código: a
  configuração de teste deles já usa essas ferramentas, e assim a F01 não precisa mexer na infraestrutura dos gates.

## Adicionar um gate

1. Acrescente `{ id, label, run }` ao array `GATES` em [scripts/runGate.mjs](scripts/runGate.mjs), na posição certa da
   ordem barato → caro. Para rodar por workspace, use o helper `eachWorkspace`.
2. Crie o script `gate:<id>` no `package.json` raiz.
3. Documente o gate nesta página, inclusive o que ele **não** cobre.

## Adicionar um workspace

1. Crie `<grupo>/<nome>/package.json` dentro de um dos grupos do `package.json` raiz (`packages`, `services`, `apps`).
2. Copie `tsconfig.json`, `tsconfig.build.json` e `jest.config.js` de um workspace existente, e declare as dependências de teste.
3. Os gates passam a checá-lo assim que ele tiver `src/`. Um grupo novo exige regras de fronteira novas no `arch`.

## O que estes gates NÃO checam

Gate verde não significa feature verificada. O que está abaixo continua sendo responsabilidade de quem valida:

- **Comportamento interativo, fora do que tem teste e2e.** O gate `e2e` só dirige os fluxos que têm teste, e hoje só
  existe a semente, que abre `/`. Nenhuma tela é exercitada: o formulário de `/users`, a navegação e a página de
  detalhe do usuário não têm teste e2e. Cada controle precisa ser exercitado individualmente numa execução com
  navegador visível. **Resultado vazio nunca valida um filtro ou uma busca**: uma busca por um valor inexistente
  retorna zero linhas funcionando ou não, então teste com um valor que existe nos dados.
- **Conformidade visual.** Não existe gate `design-system` (o projeto não tem documento de design system) nem
  `visual-contract`. Layout, contraste, espaçamento e responsividade não são verificados.
- **Outros navegadores.** O `e2e` roda só no Chromium.
- **Qualidade dos testes.** A cobertura de 80% mede linhas executadas, não asserções. Um teste que executa o
  caminho sem checar o resultado passa no gate.
- **Workspaces vazios.** `services/ai-gateway` e `packages/contract` ainda não têm `src/`, então nenhum gate os
  verifica de fato. As regras de fronteira e de ambiente foram provadas com violações deliberadas, mas só valem
  para código que existe.
- **Serviços externos.** O model atual é em memória. MySQL, Redis, OpenAI e Gemini não são exercitados pelos gates, e
  o PRD proíbe que um teste chame um provedor real. As demos D4 a D6 contra os provedores reais são manuais.
- **Regras de arquitetura por regex.** O `check-architecture` busca texto, linha a linha, e ignora só comentários `//`.
  Um `process.env` montado dinamicamente (`process['env']`) ou dentro de `/* */` escapa da regra.
- **Segurança e dependências vulneráveis.** Não há gate de `npm audit`, headers, CSRF ou validação de entrada.

## Histórico

### 2026-10-03: monorepo e gate `e2e`

- O app foi movido para `apps/web`, e `services/ai-gateway` e `packages/contract` foram criados vazios, como passo de
  setup antes da F01. Os gates passaram a rodar por workspace, e o `arch` ganhou as regras de fronteira entre eles.
- O gate `e2e` foi criado com `@playwright/test` 1.63 e o Chromium.
- Os sete gates passam (`npm run gate` verde; 10 testes Jest, 100% de linhas e 90,9% de branches; 1 teste e2e).
- Provas com violações deliberadas, todas desfeitas depois:
  - `e2e`: semente quebrada → falhou → restaurada → passou. Com o app fora do ar, falha com instruções.
  - `arch`: `web-not-to-gateway`, `gateway-not-to-web`, `packages-are-leaves` e `env-only-in-config` falharam como
    esperado, inclusive com o import pelo nome do pacote (`@arquitetura-de-ia/ai-gateway`).
- Ainda não exercitado: o no-op do `e2e` quando nada que afeta um fluxo mudou. Isso só acontece depois que este
  trabalho estiver no `origin/main`.

### 2026-09-23: estado inicial

- Todos os gates passam (`npm run gate` verde, 10 testes, 100% de linhas e 90,9% de branches).
- Na primeira execução, o `lint` apontou 7 erros no esqueleto, que foram corrigidos no código:
  - `no-unsafe-assignment`: o `req.body` agora é tratado como `unknown` e validado em `parseCreateUser`.
  - `unbound-method`: os handlers dos controllers passaram a ser arrow functions.
