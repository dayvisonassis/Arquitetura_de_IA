# Arquitetura de IA

AI Gateway: um proxy de IA multi-tenant e o sistema web que o administra. O produto está descrito no
[PRD](docs/prd/ai-gateway-prd.md). O repositório é um monorepo de apps independentes em `apps/`, sem npm
workspaces: cada app tem o próprio `package.json`, lockfile e configuração de lint, formatação e testes.

## Requisitos

- Node.js 22.13.0 (`.nvmrc`)

## Instalação

```bash
npm install                         # ferramentas da raiz (Husky, lint-staged, Prettier, Playwright)
cd apps/frontend && npm ci          # repita em apps/backend, apps/ia e apps/ia_simulator
npx playwright install chromium     # navegador dos testes de navegador (uma vez)
```

## Como rodar

Cada app sobe sozinho, de dentro da pasta dele:

| App | Comando | Endereço |
|---|---|---|
| `apps/frontend` | `npm start` | http://127.0.0.1:4200 |
| `apps/backend` | `npm run dev` | http://127.0.0.1:3030 |
| `apps/ia` | `npm run dev` | http://127.0.0.1:3131 |
| `apps/ia_simulator` | `npm run dev` | http://127.0.0.1:3132 (só na rede interna, a partir da F01) |

Os arquivos compose, o `./dev.sh`, os health checks e a configuração por `.env.<ambiente>` chegam com a F01.

## Testes e lint

Da raiz:

```bash
npm test          # testes unitários de todos os apps
npm run lint      # lint de todos os apps, com zero warnings
```

Ou por app: `npm run test:backend`, `npm run lint:frontend` etc. O `pre-commit` roda o ESLint e o Prettier nos
arquivos em staged; as convenções estão no [CLAUDE.md](CLAUDE.md).

## Estrutura

```
apps/
  frontend/        # Angular 19.2 (standalone, prefixo tails), Jest com jest-preset-angular
  backend/         # Express 4 em JavaScript + Babel, API /v2, Jest e Supertest
  ia/              # proxy de IA, Express 4 em TypeScript, Jest com ts-jest
  ia_simulator/    # destino de IA simulado (F03), mesmo molde do apps/ia
scripts/           # ferramentas da raiz (lint-staged)
docs/              # PRD e, por feature, spec, plano e contrato
```

Nenhum app importa código de outro: o frontend fala só com o backend, e só o backend fala com o proxy, sempre
por HTTP.
