# Arquitetura de IA

AI Gateway: um proxy de IA multi-tenant e o sistema web que o administra, em TypeScript. O produto está descrito
no [PRD](docs/prd/ai-gateway-prd.md). Monorepo com npm workspaces; o sistema web é Express MVC com EJS. Testes com
Jest e Playwright.

## Requisitos

- Node.js 20+

## Como rodar

```bash
npm install
npx playwright install chromium   # navegador dos testes e2e (uma vez)
cp .env.example .env              # e preencha as chaves
npm run dev        # sistema web com hot reload (tsx), em http://127.0.0.1:3000
npm run build      # compila cada workspace para <workspace>/dist/
npm start          # executa o sistema web compilado
npm test           # testes Jest de todos os workspaces
npm run test:e2e   # testes e2e (Playwright), com o app no ar
npm run gate       # todos os quality gates (ver GATES.md)
```

## Estrutura

```
packages/contract/       # contrato entre o proxy e o sistema web (a partir da F01)
services/ai-gateway/     # proxy compatível com a API da OpenAI (a partir da F01)
apps/web/                # sistema web
  src/
    app.ts               # configuração do Express (views, middlewares, rotas)
    server.ts            # ponto de entrada (sobe o servidor)
    config/env.ts        # variáveis de ambiente
    models/              # M — dados e regras de acesso
    controllers/         # C — recebem a requisição e escolhem a view
    routes/              # mapeamento URL -> controller
    middlewares/         # 404 e tratamento de erros
  views/                 # V — templates EJS (partials, páginas)
  public/                # arquivos estáticos (CSS, imagens, JS do cliente)
  tests/                 # testes Jest
tests/e2e/               # testes e2e (Playwright), um projeto por sessão
scripts/                 # orquestrador dos quality gates e regras de arquitetura
docs/                    # PRD, planos dos gates e, por feature, spec, plano e contrato
```

O `proxy` e o `sistema web` nunca importam código um do outro; o que é comum fica em `packages/contract`. O gate
`arch` verifica essa fronteira.
