# Contract — F01 Fundação: monorepo e ambiente local

> Contrato operacional desta feature, gerado pelo `spec-writer` a partir do PRD e da spec.
> O `implement-feature` precisa cumpri-lo, e o `evaluator` valida contra ele.

## Environment Contract

Sem isto, a avaliação não começa (ambiente inválido ≠ implementação errada).

- **Docker Desktop rodando** (`docker info` responde), com Compose v2+.
- **Portas livres no host:** `127.0.0.1:3306`, `:6379`, `:4200`, `:3030` e `:3131`.
- **Node 22** e `npm ci` feito nos quatro apps e na raiz.
- **As duas rodadas da `gate-builder` concluídas:**
  - a prévia criou os gates `tests-integration-backend` e `tests-integration-ia` no `GATES.md` e no
    `scripts/runGate.mjs`;
  - a posterior à implementação os provou falha → passa e registrou a data. Sem a prova, a avaliação não começa.
- **Arquivos locais criados pela implementação**, nenhum deles versionado:
  - `.env.infra`;
  - `apps/backend/.env.development` e `.env.testing`;
  - `apps/ia/.env.development` e `.env.testing`;
  - `apps/ia_simulator/.env.development`.
- **Para os critérios de runtime:** `./dev.sh` executado e os seis serviços `healthy`.
- **Para os gates de integração:** basta `./dev.sh --infra`, com MySQL e Redis `healthy`.
- **Navegador real:** a skill `playwright-cli`, para a leitura do `x-request-id` a partir da origem do frontend.
- **Regra de medição do tempo de subida (`OC-01`):**
  - vale com as imagens já construídas e os volumes de `node_modules` já povoados, isto é, depois de uma execução
    anterior de `./dev.sh`;
  - parte de `./dev.sh --down`;
  - o cronômetro vai do início do `./dev.sh` até a saída com código 0;
  - a primeira subida, com build das imagens e `npm ci` dentro dos containers, não conta.

## Quality Gates

Rodados da raiz, com `npm run gate:<id>`. As regras de cada um estão no `GATES.md`.

- [ ] `typecheck-frontend` — `tsc --noEmit -p apps/frontend/tsconfig.gate.json`
- [ ] `typecheck-monorepo` — `tsc --noEmit -p tsconfig.eslint.json` no `ia` e no `ia_simulator`
- [ ] `lint-backend` — ESLint com zero warnings nos `.js` alterados do backend
- [ ] `raw-sql-backend` — nenhum SQL raw novo em `apps/backend/src`
- [ ] `query-loop-backend` — nenhuma consulta dentro de loop em `apps/backend/src`
- [ ] `lint-frontend` — ESLint com zero warnings em `apps/frontend/src`
- [ ] `lint-monorepo` — ESLint com zero warnings no `ia` e no `ia_simulator`
- [ ] `styles-frontend` — regras do design system nos `.css`/`.html` alterados
- [ ] `build-backend` — `npm run build` (Babel), incluindo os módulos da raiz do app
- [ ] `build-monorepo` — `tsc -p tsconfig.json` no `ia` e no `ia_simulator`
- [ ] `build-frontend` — `ng build`. É optIn, mas fica declarado porque a F01 mexe no `angular.json` e no `main.ts`
- [ ] `arch` — dependency-cruiser + `check-architecture`. Inclui `no-cross-app`, `env-only-in-config` (o
  `process.env` só no `loader`, no `index` e em `src/config/`) e `listen-only-in-index`
- [ ] `tests-backend` — unit do backend, com cobertura ≥ 80% nos fontes alterados, e a suíte inteira de contratos
  consumidores (`test:contracts` numa pasta temporária, também quando só `contracts/pacts/**` mudou). O pact gerado
  precisa ter as mesmas interações do versionado
- [ ] `tests-frontend` — testes do frontend, cobertura ≥ 80% nos fontes alterados
- [ ] `tests-monorepo` — unit do `ia` e do `ia_simulator`, cobertura ≥ 80% nos fontes alterados
- [ ] `tests-integration-backend` — `migrations:test` + `__tests__/integration` do backend contra `web_test`
  (precisa de `./dev.sh --infra`)
- [ ] `tests-integration-ia` — `migrations:test` + `__tests__/integration` e `__tests__/contracts` do proxy contra
  `gateway_test`. Também dispara por mudança em `contracts/**` (precisa de `./dev.sh --infra`)
- [ ] `deadcode` — knip por app

O `e2e-frontend` **não** é declarado: a F01 não tem fluxo de usuário, e o harness só fica completo na F04.

## Coverage Manifest

- `Env-01` (CLI · `./dev.sh` e os composes) → subida e derrubada do ambiente, healthchecks, migrations, portas
  publicadas, recusa sem os arquivos de ambiente.
- `Config-01` (partida dos apps de servidor) → validação das variáveis e modelos `.env.*.example`.
- `Data-01` (MySQL/Redis) → schemas, usuários isolados e bancos lógicos.
- `API-01` (HTTP · backend `:3030`) → health, request ID, CORS e formato de erro `{ message }`.
- `API-02` (HTTP · proxy `:3131`) → health, request ID, master key em `/admin/*` e formato de erro do proxy.
- `API-03` (HTTP · simulador, rede interna) → health live.
- `Contract-01` (Pact backend → proxy) → o contrato do 401 da master key, gerado pelo backend, verificado pelo proxy, e
  a prova negativa.
- `UI-01` (frontend `:4200`) → serve `/` com 200 e lê o `x-request-id` das respostas do backend.
- `Repo-01` (estrutura do repositório) → apps independentes, sem workspaces, sem segredo versionado, e nenhum teste
  chamando provedor real.

## Surfaces & Behaviors

### Surface: `Env-01` — `./dev.sh` e os composes
- **Estado inicial:** nenhum container do projeto rodando; arquivos de ambiente criados; imagens e volumes de
  `node_modules` já povoados.
- **Comportamentos:**
  - [ ] `./dev.sh` termina com código 0, e os seis serviços ficam `healthy` (`docker compose ps` dos dois projetos)
    dentro da regra de medição.
  - [ ] As migrations do backend e do proxy são aplicadas: a tabela `knex_migrations` existe em `web` e em `gateway`.
  - [ ] `./dev.sh --down` deixa zero containers dos projetos `ai-gateway-infra` e `ai-gateway-app`.
  - [ ] `./dev.sh --infra` sobe só o MySQL e o Redis, `healthy`, exigindo apenas o `.env.infra`.
  - [ ] Sem `.env.infra`, ou sem um `.env.development`, o `./dev.sh` não sobe nada, sai com código diferente de zero e
    lista os arquivos que faltam. O avaliador renomeia o arquivo e o restaura depois, sem editar código.
  - [ ] Com a senha do banco de um app diferente da do `.env.infra`, o `./dev.sh` recusa e nomeia a variável, sem
    imprimir valores.
  - [ ] As portas publicadas são só `127.0.0.1:4200`, `:3030`, `:3131`, `:3306` e `:6379` (`docker port`). O
    `ia_simulator` não publica porta nenhuma, mas responde `GET /health/live` de dentro da rede
    (`docker compose exec backend …`).

### Surface: `Config-01` — partida dos apps de servidor
- **Estado inicial:** app com o arquivo de ambiente completo.
- **Comportamentos:**
  - [ ] O ponto de entrada do backend e o do proxy, executados direto com `GATEWAY_MASTER_KEY` **vazia**, saem com
    código 1. A saída contém `Missing or invalid environment variable: GATEWAY_MASTER_KEY` e nenhum valor de variável.
    - Procedimento no host, pelo Git Bash: `cd apps/backend && GATEWAY_MASTER_KEY= npx babel-node index.js` e
      `cd apps/ia && GATEWAY_MASTER_KEY= npx ts-node index.ts`.
    - Ou no container: `docker compose … run --rm --no-deps -e GATEWAY_MASTER_KEY= backend …`.
    - A variável precisa estar **vazia**, não removida do ambiente: removida, o loader a preenche a partir do
      `.env.development`. No PowerShell, atribuir `''` remove a variável, então use o Git Bash.
  - [ ] Idem, no backend, com `JWT_SECRET` de 31 caracteres e com `KEY_ENCRYPTION_KEY` fora de 64 hexadecimais.
  - [ ] Nos containers de desenvolvimento, a mesma falha deixa o serviço `unhealthy`, e a linha aparece em
    `docker compose logs`.
  - [ ] Cada app de servidor versiona `config/.env.development.example`, `.env.testing.example` e
    `.env.production.example`, com todas as variáveis que o seu `src/config/env` lê.

### Surface: `Data-01` — MySQL e Redis
- **Estado inicial:** infra no ar, schemas criados pelo init.
- **Comportamentos:**
  - [ ] O `web_app` recebe "acesso negado" (ER 1044) ao listar as tabelas de `gateway`.
  - [ ] O `gateway_app` recebe "acesso negado" ao listar as tabelas de `web`.
  - [ ] Com o ambiente no ar, `CLIENT LIST` no Redis mostra o cliente `ai-gateway-ia` em `db=0` e o
    `ai-gateway-backend` em `db=1`. Os testes de integração usam o db 2 (proxy) e o 3 (backend), pelo `.env.testing`.

### Surface: `API-01` — backend
- **Estado inicial:** backend `healthy`; nenhuma requisição anterior.
- **Comportamentos:**
  - [ ] `GET /health/live` → 200 `{ "status": "ok" }`.
  - [ ] `GET /health/ready` → 200 com `mysql` e `redis` em `ok`. Com o Redis parado (`docker stop`) → 503 com
    `checks.redis = "fail"` e `message`, e o processo do backend continua vivo.
  - [ ] Toda resposta, inclusive 404, 400 e 403, traz `x-request-id` com 32 hex minúsculos. Um ID válido enviado volta
    igual; um inválido (maiúsculas, 31 caracteres, só zeros) é trocado.
  - [ ] Rota inexistente → 404 `{ "message": "Rota não encontrada." }`; JSON inválido → 400 `{ "message": … }`.
  - [ ] `Origin: http://127.0.0.1:4200` → `Access-Control-Allow-Origin` igual à origem e
    `Access-Control-Expose-Headers` contendo `x-request-id`. O preflight dessa origem → 204, permitindo
    `Authorization`.
  - [ ] Outra origem → 403 `{ "message": "Origem não permitida." }`, sem `Access-Control-Allow-Origin`.

### Surface: `API-02` — proxy
- **Estado inicial:** proxy `healthy`.
- **Comportamentos:**
  - [ ] `GET /health/live` → 200; `GET /health/ready` → 200 com `mysql` e `redis` em `ok`.
  - [ ] Toda resposta traz `x-request-id`, com a mesma regra do backend.
  - [ ] `GET /admin/domains` sem `Authorization` → 401
    `{ "error": { "code": "invalid_admin_key", "type": "authentication_error", "message": … } }`.
  - [ ] Com uma master key errada → o mesmo 401.
  - [ ] Com a master key certa → 404 `not_found`, porque a F01 não tem endpoints administrativos.

### Surface: `API-03` — simulador
- **Estado inicial:** `ia_simulator` `healthy`.
- **Comportamentos:**
  - [ ] `GET /health/live` de dentro da rede → 200 `{ "status": "ok" }`.

### Surface: `Contract-01` — Pact backend → proxy
- **Estado inicial:** `contracts/pacts/ai-gateway-backend-ai-gateway-ia.json` versionado.
- **Comportamentos:**
  - [ ] O teste consumidor do backend passa e gera um pact com as mesmas interações do versionado: as duas da
    spec (§5).
  - [ ] A verificação do provedor no proxy passa contra o app real.
  - [ ] O teste negativo do provedor passa: a mesma verificação, contra o app com o `code` do 401 trocado ou sem o
    `x-request-id`, falha.

### Surface: `UI-01` — frontend
- **Estado inicial:** ambiente do `./dev.sh` no ar.
- **Comportamentos:**
  - [ ] `GET http://127.0.0.1:4200/` → 200.
  - [ ] Numa página aberta em `http://127.0.0.1:4200`, um `fetch('http://127.0.0.1:3030/health/live')` lê
    `response.headers.get('x-request-id')` com 32 hex.

### Surface: `Repo-01` — estrutura do repositório
- **Estado inicial:** árvore do `main`.
- **Comportamentos:**
  - [ ] Cada app tem `package.json` e `package-lock.json` próprios; o `package.json` da raiz não tem `workspaces`.
  - [ ] O setup de testes do proxy instala a guarda contra os hosts da OpenAI e do Google, e o teste dela passa. As
    chaves do `.env.testing.example` do proxy são fictícias.
  - [ ] Nenhum arquivo de ambiente real nem o `.env.infra` está no Git (`git ls-files`).
  - [ ] As chaves dos provedores estão declaradas só no proxy. A conferência é feita pelos **nomes**, sem ler valores:
    - o `.env` raiz não declara `OPENAI_API_KEY` nem `GEMINI_API_KEY`, ou não existe;
    - o `apps/ia/.env.development` declara as duas, não vazias.

## Observable Criteria

Rastreio para os critérios de aceite da F01 no PRD (§9):

- [ ] `OC-01` — `./dev.sh` deixa os seis serviços `healthy` em até 2 min, com as migrations aplicadas (PRD AC 1).
  Evidência: código 0, `docker compose ps` dos dois projetos, tabela `knex_migrations` em `web` e em `gateway`, e o
  tempo medido pela regra do Environment Contract.
- [ ] `OC-02` — `./dev.sh --down` para todos os containers dos dois composes (PRD AC 1). Evidência: `docker ps`
  filtrado pelos projetos, vazio.
- [ ] `OC-03` — O usuário MySQL do backend não lê `gateway`, e o do proxy não lê `web` (PRD AC 2). Evidência: os testes
  `database-isolation` dos dois apps no verde, e ER 1044 numa tentativa manual com cada usuário.
- [ ] `OC-04` — Cada app de servidor versiona `config/.env.<ambiente>.example` com todas as variáveis que o seu módulo
  de configuração lê (PRD AC 3). Evidência: a lista de variáveis lidas em `src/config/env` bate com as chaves dos três
  modelos de cada app.
- [ ] `OC-05` — Só `127.0.0.1:4200`, `:3030`, `:3131`, `:3306` e `:6379` ficam publicadas; nada em `0.0.0.0`; o
  simulador não é acessível do host (PRD AC 4). Evidência: `docker port` de cada container; `curl` do host na porta do
  simulador falha; de dentro da rede responde.
- [ ] `OC-06` — Cada app tem `package.json` e lockfile próprios, e a raiz não declara workspaces (PRD AC 5). Evidência:
  os arquivos e o campo ausente.
- [ ] `OC-07` — Um serviço iniciado sem uma variável obrigatória não sobe, e o log mostra o nome dela (PRD AC 6).
  Evidência: código 1 e a linha `Missing or invalid environment variable: <NOME>` ao rodar o ponto de entrada do
  backend e do proxy com a variável vazia, pelo procedimento do `Config-01`. Nos containers, o serviço `unhealthy` com
  a mesma linha no log.
- [ ] `OC-08` — Toda resposta do backend e do proxy traz `x-request-id` com 32 hex minúsculos; um ID válido volta
  igual; um inválido é trocado (PRD AC 7). Evidência: os testes de request ID e `curl -i` nos dois apps, inclusive
  em 404.
- [ ] `OC-09` — `/admin/*` responde 401 sem a master key e com uma master key errada (PRD AC 8). Evidência: `curl` nos
  dois casos, com corpo `invalid_admin_key`, e as duas interações do pact verificadas.
- [ ] `OC-10` — Mudar no proxy um código de erro, um header ou um campo de resposta que o backend usa faz um teste de
  contrato falhar (PRD AC 9). Evidência: o teste negativo do provedor no verde, que mostra a verificação falhando com o
  `code` trocado e com o `x-request-id` removido.
- [ ] `OC-11` — O backend recusa pelo CORS outra origem, e o frontend lê o `x-request-id` das respostas (PRD AC 10).
  Evidência: 403 sem `Access-Control-Allow-Origin` para outra origem; no navegador, a partir de `:4200`, o header é
  lido.
- [ ] `OC-12` — `npm run gate` passa em todos os apps, e o `arch` falha se um app importar código de outro (PRD AC 11).
  Evidência: a cadeia padrão verde com os dois gates de integração, e a prova de `no-cross-app` já registrada no
  histórico do `GATES.md` (import do backend dentro do `ia`, barrado). O avaliador não precisa editar código.
- [ ] `OC-13` — Nenhum teste da suíte faz chamada de rede para a OpenAI ou o Google (PRD AC 12). Evidência: a guarda
  instalada no setup de testes do proxy, o teste dela no verde (os dois hosts recusados, via `fetch` e `https`), e as
  chaves fictícias do `.env.testing.example`.
- [ ] `OC-14` — Os health checks do backend e do proxy reportam o MySQL e o Redis, e o simulador tem `live`; os
  healthchecks do compose usam esses endpoints (regras da F01). Evidência: as respostas da §5 da spec, o `ready` em 503
  com o Redis parado e o processo vivo, e as definições de `healthcheck` nos composes.
- [ ] `OC-15` — Os erros do backend têm o formato `{ "message": "..." }`, e os do proxy
  `{ "error": { "message", "type", "code" } }` (regras da F01 e F08). A única exceção é o 503 de health do proxy, que
  usa o formato de health. Evidência: 404 e JSON inválido nos dois apps.
- [ ] `OC-16` — Nenhum segredo está versionado, e as chaves dos provedores estão declaradas só no proxy. Evidência: a
  conferência por nomes do `Repo-01`, `git ls-files` sem arquivo de ambiente real, `.env.infra` ignorado e o
  `.env.example` raiz removido.

## Test-suite hint

O projeto tem o gate `e2e-frontend`, mas ainda não provado verde, então esta tabela é orientativa.

| Superfície / comportamento | Suíte |
|---|---|
| `API-01` — request ID, CORS, erros, formato de health | unit (`tests-backend`) |
| `API-01` — `ready` com MySQL e Redis reais | integration (`tests-integration-backend`) |
| `API-02` — request ID, master key, erros | monorepo unit (`tests-monorepo`) |
| `API-02` — `ready` com MySQL e Redis reais | integration (`tests-integration-ia`) |
| `API-03` — health live | monorepo unit (`tests-monorepo`) |
| `Contract-01` — consumidor | contract (`tests-backend`) |
| `Contract-01` — provedor e prova negativa | contract (`tests-integration-ia`) |
| `Data-01` — isolamento dos usuários | integration (`tests-integration-backend` e `tests-integration-ia`) |
| `Data-01` — bancos Redis por app | runtime-only (`CLIENT LIST`) |
| `Config-01` — validação | unit (`tests-backend`, `tests-monorepo`) + runtime-only (ponto de entrada sem a variável) |
| `Env-01` — `./dev.sh`, portas, `--down` | runtime-only |
| `UI-01` — `/` responde 200 | runtime-only |
| `UI-01` — leitura do `x-request-id` pela origem do frontend | runtime-only (navegador com `playwright-cli`; o e2e chega com a F04) |
| `Repo-01` — estrutura, segredos e guarda dos provedores | runtime-only (inspeção por nomes) + monorepo unit (teste da guarda) |

Nenhum endpoint de leitura da F01 lista registros, então não há linha `integration — query growth`. Os desfechos estão
na §7 da spec.
