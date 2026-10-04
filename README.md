# Arquitetura de IA

AI Gateway: um proxy de IA multi-tenant e o sistema web que o administra. O produto está descrito no
[PRD](docs/prd/ai-gateway-prd.md). O repositório é um monorepo de apps independentes em `apps/`, sem npm
workspaces: cada app tem o próprio `package.json`, lockfile e configuração de lint, formatação e testes.

## Requisitos

- Node.js 22.13.0 (`.nvmrc`)
- Docker Desktop rodando, com Compose v2 ou mais novo
- Portas livres no host: `127.0.0.1:4200`, `:3030`, `:3131`, `:3306` e `:6379`

## Instalação

```bash
npm install                         # ferramentas da raiz (Husky, lint-staged, Prettier, Playwright)
cd apps/frontend && npm ci          # repita em apps/backend, apps/ia e apps/ia_simulator
npx playwright install chromium     # navegador dos testes de navegador (uma vez)
```

O `npm ci` no host serve aos testes, ao lint e aos gates. Os containers instalam as dependências deles num volume
próprio.

## Arquivos de ambiente

Nenhum arquivo de ambiente real é versionado. Cada um tem um modelo versionado com o mesmo nome e o sufixo `.example`:

| Arquivo local (ignorado pelo Git) | Modelo | Para quê |
|---|---|---|
| `.env.infra` | `config/.env.infra.example` | senhas do MySQL (root, `gateway_app`, `web_app`) e do Redis |
| `apps/backend/.env.development` e `.env.testing` | `apps/backend/config/.env.<ambiente>.example` | backend |
| `apps/ia/.env.development` e `.env.testing` | `apps/ia/config/.env.<ambiente>.example` | proxy |
| `apps/ia_simulator/.env.development` | `apps/ia_simulator/config/.env.development.example` | destino simulado |

```bash
cp config/.env.infra.example .env.infra
cp apps/backend/config/.env.development.example apps/backend/.env.development
# idem para .env.testing do backend, .env.development e .env.testing do apps/ia e .env.development do simulador
```

Depois, preencha os valores vazios:

- **`.env.infra`:** uma senha para cada variável.
- **Banco e Redis dos apps:** o `DB_PASSWORD` do backend é o `WEB_DB_PASSWORD`, o do proxy é o `GATEWAY_DB_PASSWORD`,
  e o `REDIS_PASSWORD` dos dois é o do `.env.infra`. O `./dev.sh` confere que batem, sem mostrar os valores.
- **Segredos dos apps:**
  - `GATEWAY_MASTER_KEY` com 32 caracteres ou mais, a mesma no backend e no proxy;
  - `JWT_SECRET` com 32 caracteres ou mais;
  - `KEY_ENCRYPTION_KEY` com 64 caracteres hexadecimais;
  - o e-mail e a senha do primeiro administrador, no backend;
  - as chaves da OpenAI e do Google AI Studio, no `.env.development` do proxy.

  O `.env.testing` do proxy fica com as chaves fictícias do modelo: nenhum teste chama um provedor real.

Um app de servidor iniciado sem uma variável obrigatória, ou com uma inválida, não sobe: sai com código 1 e uma linha
`Missing or invalid environment variable: <NOME>`, sem o valor.

## Como rodar

```bash
./dev.sh            # MySQL, Redis e os quatro apps, com as migrations aplicadas
./dev.sh --infra    # só o MySQL e o Redis, para os testes de integração
./dev.sh --down     # derruba tudo, mantendo os volumes
```

No Windows, rode no Git Bash. Com as imagens e as dependências já instaladas, o `./dev.sh` deixa os seis serviços
`healthy` em menos de um minuto:

| Serviço | Endereço | Health |
|---|---|---|
| frontend | http://127.0.0.1:4200 | `/` responde 200 |
| backend | http://127.0.0.1:3030 (API em `/v2`) | `GET /health/live`, `GET /health/ready` |
| proxy (`ia`) | http://127.0.0.1:3131 | `GET /health/live`, `GET /health/ready` |
| destino simulado (`ia_simulator`) | só na rede interna, `http://ia_simulator:3132` | `GET /health/live` |
| MySQL | `127.0.0.1:3306` | `mysqladmin ping` |
| Redis | `127.0.0.1:6379` | `PING` |

A primeira execução constrói as imagens e roda o `npm ci` dentro de cada container, o que leva mais tempo. Depois
disso, o `npm ci` só roda de novo quando o `package-lock.json` de um app muda. O código entra nos containers por bind
mount, e a recarga é automática.

### Logs

```bash
docker compose -p ai-gateway-app logs -f backend      # ou frontend, ia, ia_simulator
docker compose -p ai-gateway-infra logs -f mysql      # ou redis
```

Os apps de servidor logam em JSON (pino), com o `x-request-id` de cada requisição. Quando falta uma variável, o
container fica `unhealthy` e a linha `Missing or invalid environment variable: <NOME>` aparece no log.

### Bancos

O MySQL tem um schema por serviço e um de teste para cada um, e cada app usa um usuário que só enxerga os próprios
schemas:

| Schema | Usuário | Uso |
|---|---|---|
| `gateway` / `gateway_test` | `gateway_app` | proxy: desenvolvimento / testes |
| `web` / `web_test` | `web_app` | backend: desenvolvimento / testes |

O Redis usa o db 0 (proxy) e o 1 (backend) em desenvolvimento, e o 2 e o 3 nos testes.

**Trocou uma senha do `.env.infra`?** O script de init do MySQL só roda com o volume vazio. Para recriar os usuários
com as senhas novas, derrube o ambiente e remova o volume do MySQL manualmente. Isso apaga os dados locais:

```bash
./dev.sh --down
docker volume rm ai-gateway-infra_mysql-data
./dev.sh
```

### Migrations

Cada app com banco tem as próprias migrations Knex, nomeadas `YYYYMMDDHHMMSS_descricao`:

```bash
cd apps/backend && npm run migration:add -- nome_da_migration   # idem em apps/ia
npm run migrations:dev                                          # o ./dev.sh já faz isso
```

## Catálogo de capacidades

As capacidades (`developer-assistant`, `architecture-advisor`, `ticket-classifier`) e os deployments que as atendem
(provedor, modelo físico, credencial, parâmetros e preços) ficam em
[apps/ia/catalog/catalog.json](apps/ia/catalog/catalog.json). Os campos e as faixas aceitas estão na
[spec da F02](docs/F02-catalogo-de-capacidades/spec.md) (§5). A credencial é o **nome** de uma variável do
`apps/ia/.env.<ambiente>`, nunca o valor.

**Depois de editar o arquivo, reinicie o proxy.** O catálogo é lido só na partida, e a recarga automática do container
não observa o JSON:

```bash
docker compose -p ai-gateway-app restart ia
```

**Catálogo inválido:** o proxy não sobe. Ele sai com código 1 e uma linha `Invalid catalog: <problema>` por problema,
por exemplo `Invalid catalog: capability 'ticket-classifier' points to fallback 'gemini-lite', which does not exist`. No
container, o serviço fica `unhealthy`, e as linhas aparecem no log do `ia`.

**Outro arquivo:** a variável opcional `CATALOG_FILE` (caminho relativo a `apps/ia`, padrão `catalog/catalog.json`)
troca o catálogo, por exemplo para testar uma fixture sem editar o versionado:

```bash
cd apps/ia
CATALOG_FILE=__tests__/fixtures/catalog/fallback-missing.json node -r ts-node/register/transpile-only index.ts
```

**Suspender e reativar** uma capacidade ou um deployment, pela API administrativa do proxy, com a master key (lida do
arquivo, sem imprimi-la):

```bash
KEY=$(grep '^GATEWAY_MASTER_KEY=' apps/ia/.env.development | cut -d= -f2-)

curl -s -H "Authorization: Bearer $KEY" http://127.0.0.1:3131/admin/catalog

curl -s -H "Authorization: Bearer $KEY" -H 'content-type: application/json' \
  -d '{"reason":"Incidente no provedor","actor":"admin_platform@aigateway.test"}' \
  http://127.0.0.1:3131/admin/deployments/openai-gpt-4-1-mini/suspend

curl -s -H "Authorization: Bearer $KEY" -H 'content-type: application/json' \
  -d '{"actor":"admin_platform@aigateway.test"}' \
  http://127.0.0.1:3131/admin/deployments/openai-gpt-4-1-mini/resume
```

- **Equivalentes para capacidade:** `/admin/capabilities/<nome>/suspend` e `/resume`.
- **Efeito:** imediato, sem reiniciar nada.
- **Persistência:** a suspensão fica na tabela `catalog_suspensions` (MySQL) e é replicada no Redis, então sobrevive a
  um reinício do proxy e do Redis. O cooldown fica só no Redis.
- **Erros:**
  - nome fora do catálogo → 404;
  - `reason` ausente ou acima de 200 caracteres, ou `actor` que não é e-mail → 400;
  - suspender o que já está suspenso, ou reativar o que está ativo → 409;
  - MySQL ou Redis fora do ar → 503 em até 3 s, sem alterar nada.
- **Acentos no Windows:** o `curl` envia o argumento `-d` na página de código ANSI, então um motivo com acento chega
  corrompido. Escreva sem acento, ou mande o corpo de um arquivo UTF-8 com `--data-binary @corpo.json`.

## Testes e lint

Da raiz:

```bash
npm test          # testes unitários de todos os apps (sem banco)
npm run lint      # lint de todos os apps, com zero warnings
npm run gate      # os quality gates (ver GATES.md)
```

Ou por app: `npm run test:backend`, `npm run lint:frontend` etc. O `pre-commit` roda o ESLint e o Prettier nos
arquivos em staged; as convenções estão no [CLAUDE.md](CLAUDE.md).

**Testes de integração** rodam fora dos containers, contra os schemas de teste, e precisam só da infraestrutura:

```bash
./dev.sh --infra
cd apps/backend && npm run test:integration    # aplica as migrations de teste e roda __tests__/integration
cd apps/ia && npm run test:integration
```

**Testes de contrato** (Pact) entre o backend e o proxy: veja [contracts/README.md](contracts/README.md).

## Estrutura

```
apps/
  frontend/        # Angular 19.2 (standalone, prefixo tails), Jest com jest-preset-angular
  backend/         # Express 4 em JavaScript + Babel, API /v2, Jest e Supertest
  ia/              # proxy de IA, Express 4 em TypeScript, Jest com ts-jest
  ia_simulator/    # destino de IA simulado (F03), mesmo molde do apps/ia
config/            # modelo do .env.infra
contracts/         # contratos Pact entre o backend e o proxy
infra/mysql/init/  # criação dos schemas e dos usuários do MySQL
scripts/           # gates, lint-staged e o entrypoint dos containers de desenvolvimento
docs/              # PRD e, por feature, spec, plano e contrato
docker-compose.infra.dev.yml, docker-compose.app.dev.yml, dev.sh
```

Nenhum app importa código de outro: o frontend fala só com o backend, e só o backend fala com o proxy, sempre
por HTTP.
