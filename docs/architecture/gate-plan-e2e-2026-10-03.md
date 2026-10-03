# Gate Plan — gate `e2e` — arquitetura-de-ia

- **Data:** 2026-10-03
- **Modo:** brownfield (extensão). Os gates `typecheck → lint → build → arch → tests → deadcode` já existem
  e passam (ver [GATES.md](../../GATES.md)). Este plano só acrescenta o gate `e2e`.
- **Status:** confirmado e construído em 2026-10-03 — ver [GATES.md](../../GATES.md)

> **Mudança de ordem aprovada depois deste plano:** antes de construir o gate, o app foi movido para `apps/web` e os
> workspaces `services/ai-gateway` e `packages/contract` foram criados vazios, como passo de setup antes da F01. Na
> mesma rodada, os outros gates passaram a rodar por workspace e o `arch` ganhou as regras de fronteira
> `web-not-to-gateway`, `gateway-not-to-web` e `packages-are-leaves`. Por isso o gate `e2e` já nasceu no layout do
> monorepo, e as diferenças em relação ao texto abaixo são:
> - o escopo cobre os três workspaces inteiros, mais `tests/e2e/`, a config do runner e o `package-lock.json`;
> - o Jest não precisou de `testPathIgnorePatterns`: `tests/e2e/` fica na raiz, fora dos `roots` de cada workspace;
> - o `tsconfig.json` raiz passou a cobrir só a config do runner e `tests/e2e/`; as opções comuns foram para `tsconfig.base.json`.

## Detecção

- Continua sem relatórios de arquitetura. A skill rodou em **modo reduzido**, lendo `package.json`,
  `jest.config.js`, `knip.json`, `tsconfig.json`, `eslint.config.mjs`, `scripts/runGate.mjs` e o PRD
  (`docs/prd/ai-gateway-prd.md`).
- Não há runner de navegador instalado (`@playwright/test` ausente, sem config do Playwright).
- O app hoje é um esqueleto Express + EJS **sem autenticação**: as telas `/` e `/users` são placeholders.
- O PRD muda o terreno em duas features:
  - **F01** transforma o repositório em monorepo (`apps/web`, `services/ai-gateway`, `packages/contract`)
    e o ambiente passa a subir com `docker compose` (MySQL 8 + Redis 7). O sistema web continua em
    `http://127.0.0.1:3000`.
  - **F04** traz login com 3 papéis (`platform_admin`, `domain_admin`, `user`), sessão de 8 h no Redis
    e bloqueio da conta após 5 tentativas erradas.
- **As skills de teste pressupõem outro layout.** Este projeto não tem o layout `apps/frontend` + `apps/backend`,
  então a `e2e-test-writer` não é despachada aqui: o `implement-feature` escreve os testes e2e pelo
  fallback genérico, e o `evaluator` registra como PENDING (para um humano) a cobertura e2e que faltar.

## Gate

| id | Comando | Configuração |
|---|---|---|
| `e2e` | `playwright test --config playwright.e2e.config.ts` | novo `playwright.e2e.config.ts` |

**Config do runner** (separada de qualquer futuro `visual-contract`):
- `testDir: tests/e2e`, só Chromium, **headless**, `retries: 0` (um gate não pode passar na segunda tentativa).
- `baseURL` = `E2E_BASE_URL`, com padrão `http://127.0.0.1:3000` (o mesmo endereço que o PRD fixa para o sistema web).
- `trace` e `screenshot` só em falha, saída em `test-results/e2e/`.
- **Sem `webServer`:** o gate exige o app no ar. Se ele não responder, o gate **falha com instruções**
  (`npm run dev` hoje, `docker compose up` depois da F01), nunca pula em silêncio.
- Um projeto do runner por sessão. Hoje há só `public` (sem login).

**Escopo (changed-files):** roda quando muda algo em `src/`, `views/`, `public/`, `tests/e2e/` ou na
config do runner, comparando com `origin/main` (ou `HEAD`, se não houver remoto) mais os arquivos não
rastreados. Sem mudança nesses caminhos, é um no-op que passa e avisa.
- `E2E_FORCE=1` roda mesmo sem mudança.
- `E2E_SKIP=1` é a válvula de escape: o gate passa, mas imprime um banner dizendo o que **não** foi verificado.

**Teste semente:** `tests/e2e/public/seed.spec.ts` abre `/` e confere que o layout carregou. Ele prova o
harness, não o produto. Na construção, a expectativa da semente é quebrada de propósito para provar que o
gate falha → corrigida → passa.

**Isolamento das outras ferramentas:**
- Jest: `testPathIgnorePatterns` para `tests/e2e/` (hoje os arquivos `*.spec.ts` já não casam com `*.test.ts`; a regra deixa isso explícito).
- knip: a config do runner e os specs entram como entry.
- typecheck/lint: a config do runner entra no `tsconfig.json`; os specs já estão em `tests/`.

**Ordem no `runGate`:** `typecheck → lint → build → arch → tests → deadcode → e2e`.
O `e2e` só entra na lista padrão do `npm run gate` depois de provado verde uma vez, e a data fica registrada no `GATES.md`.

## O que fica para depois (e por quê)

| Quando | O que muda no harness | Quem faz |
|---|---|---|
| Reestruturação em monorepo (F01) | caminhos do escopo passam a `apps/web/**`, `services/ai-gateway/**` e `packages/contract/**`; a instrução para subir o app vira `docker compose up`. `tests/e2e/` fica na raiz, porque um fluxo atravessa os serviços. | `gate-builder` (a mesma rodada que estende os outros gates aos 3 workspaces) |
| F04 concluída (login) | global setup que entra uma vez por papel e guarda a sessão em `tests/e2e/.auth/<papel>.json`, reaproveitada enquanto for válida (8 h); um projeto do runner e uma semente por papel; contas `domain_admin` e `user` no mesmo domínio; uma fixture de API por sessão para criar e remover dados. Nunca repetir login em loop: 5 erros bloqueiam a conta por 15 min. | `gate-builder` |

## Decisões provisórias (para o time confirmar)

- Diretório: `tests/e2e/<projeto>/`, um projeto por sessão.
- Contas: nenhuma até a F04.
- Convenções dos testes de feature, política de dados e contas usadas: **indefinidas**. Como não há
  test-writer para esta stack, quem escreve é o `implement-feature`, marcando cada teste com
  `@<feature-id>` e os ids das superfícies, e mantendo a tabela de cobertura em `docs/<feature>/e2e-test.md`.

## Arquivos

- **Criar:** `playwright.e2e.config.ts`, `tests/e2e/public/seed.spec.ts`
- **Modificar:** `package.json` (devDependency `@playwright/test`; scripts `gate:e2e` e `test:e2e`),
  `scripts/runGate.mjs`, `jest.config.js`, `knip.json`, `tsconfig.json`, `.gitignore`
  (`test-results/`, `playwright-report/`, `tests/e2e/.auth/`), `GATES.md`
- **Instalar:** `@playwright/test` e o Chromium do Playwright (`npx playwright install chromium`)
- **Não tocar:** `src/`, `views/`, `public/` e os testes Jest existentes
