# Contract — F02 Catálogo de capacidades

> Contrato operacional desta feature, gerado pelo `spec-writer` a partir do PRD e da spec.
> O `implement-feature` precisa cumpri-lo, e o `evaluator` valida contra ele.

## Environment Contract

Sem isto, a avaliação não começa (ambiente inválido ≠ implementação errada).

- **Docker Desktop rodando** (`docker info` responde), com as portas `127.0.0.1:3306`, `:6379`, `:4200`, `:3030` e
  `:3131` livres para o ambiente do projeto.
- **Node 22** e `npm ci` feito no `apps/ia` (com o `joi` instalado) e na raiz.
- **Arquivos locais da F01**, nenhum deles versionado: `.env.infra`, `apps/ia/.env.development` (com as chaves reais dos
  provedores) e `apps/ia/.env.testing` (com as chaves fictícias). O `CATALOG_FILE` é opcional e não precisa estar neles.
- **Para os gates de integração:** `./dev.sh --infra`, com MySQL e Redis `healthy`.
- **Para os critérios de runtime:** `./dev.sh` executado, os seis serviços `healthy` e a migration da F02 aplicada (o
  `./dev.sh` aplica as pendentes).
- **Master key nas chamadas `curl`:** lida do `apps/ia/.env.development` sem imprimir, no Git Bash:
  `KEY=$(grep '^GATEWAY_MASTER_KEY=' apps/ia/.env.development | cut -d= -f2-)` e
  `-H "Authorization: Bearer $KEY"`.
- **Redis e MySQL do ambiente de desenvolvimento, sem imprimir senhas** (as senhas vêm do ambiente do próprio container),
  no Git Bash, a partir da raiz:
  - Redis do proxy (db 0):
    `docker compose -p ai-gateway-infra exec redis sh -c 'REDISCLI_AUTH="$REDIS_PASSWORD" redis-cli -n 0 HGETALL catalog:suspensions'`.
    Troque o comando final por `DEL catalog:suspensions` para apagar a réplica;
  - cooldown de 30 s:
    `END=$(date -u -d '+30 seconds' +%Y-%m-%dT%H:%M:%S.000Z)` e
    `docker compose -p ai-gateway-infra exec -e END="$END" redis sh -c 'REDISCLI_AUTH="$REDIS_PASSWORD" redis-cli -n 0 SET catalog:cooldown:openai-gpt-4-1 "$END" PX 30000'`;
  - MySQL do proxy:
    `docker compose -p ai-gateway-infra exec mysql sh -c 'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mysql -uroot gateway -e "SELECT * FROM catalog_suspensions"'`;
  - estado inicial limpo: o `SELECT` acima vazio, e
    `… redis-cli -n 0 --scan --pattern 'catalog:cooldown:*'` sem resultado.
- **Sem navegador:** a F02 não tem tela.

**Fora deste contrato (spec §1):**
- **F08:** o `GET /v1/models` filtrado pela chave; o 503 `capability_unavailable` numa chamada ao `/v1`; o uso de uma
  capacidade nova pelo `/v1`;
- **F11:** o uso de uma capacidade nova pelo script de exemplo e pelo sistema web, sem mudança neles.

O avaliador não cobra esses itens aqui.

## Quality Gates

Rodados da raiz, com `npm run gate:<id>`. As regras de cada um estão no `GATES.md`. A cadeia padrão (`npm run gate`)
precisa passar inteira. Os gates de apps que a F02 não altera dão `PASS (nothing to check)`.

- [ ] `typecheck-monorepo` — `tsc --noEmit -p tsconfig.eslint.json` no `ia`
- [ ] `lint-monorepo` — ESLint com zero warnings no `ia` inteiro: a F02 muda o `package.json` e o lockfile, e por isso o
  gate considera o app todo (`GATES.md`, "Escopo")
- [ ] `build-monorepo` — `tsc -p tsconfig.json` no `ia`
- [ ] `arch` — dependency-cruiser + `check-architecture`. O `process.env` só em `src/config/**`, `index` e `loader`
  (o carregador do catálogo fica em `src/config/`); services não importam controllers nem routes
- [ ] `tests-monorepo` — a suíte unitária inteira do `ia`, com cobertura ≥ 80% sobre todo o `src/`: pela mesma mudança no
  `package.json`, o gate roda o app todo, e não só os testes relacionados
- [ ] `tests-integration-ia` — `migrations:test` + `__tests__/integration` (inclui a API do catálogo, a recusa na
  partida e a carga do catálogo versionado) + `__tests__/contracts` do proxy, contra o `gateway_test` e o Redis db 2.
  É o gate que pega uma mudança só no `catalog/catalog.json` (precisa de `./dev.sh --infra`)
- [ ] `deadcode` — knip no `ia`: nenhum export sem uso, e o `joi` usado

Nenhum gate novo; nenhuma rodada da `gate-builder`. O `e2e-frontend` não se aplica (sem tela).

## Coverage Manifest

- `Catalog-01` (arquivo do catálogo e partida do proxy) → esquema, regras de nome, faixas, referências, credenciais,
  relato de todos os problemas e recusa na partida.
- `API-01` (HTTP · `/admin` do proxy `:3131`, com a master key) → `GET /admin/catalog`, suspend e resume de
  capacidades e deployments, avisos e erros.
- `State-01` (MySQL `gateway.catalog_suspensions` e Redis `catalog:*`) → persistência da suspensão, réplica, recarga e
  leitura do cooldown.
- `Config-01` (configuração e documentação) → `CATALOG_FILE` nos modelos e no `src/config/env`, e a seção do README.

## Surfaces & Behaviors

### Surface: `Catalog-01` — arquivo do catálogo e partida
- **Estado inicial:** `apps/ia` com o `.env.development` completo; nenhum processo do proxy rodando no host.
- **Procedimento:**
  - no host, pelo Git Bash: `cd apps/ia && CATALOG_FILE=<fixture> node -r ts-node/register/transpile-only index.ts`;
  - as fixtures ficam em `__tests__/fixtures/catalog/`;
  - o avaliador não edita arquivo versionado.
- **Comportamentos:**
  - [ ] Com o catálogo versionado, a validação passa: os testes `the versioned catalog should be valid` e
    `GET /admin/catalog should mirror the versioned catalog file` passam, e o proxy do `./dev.sh` fica `healthy`.
  - [ ] `fallback-missing.json` → código 1, e o `stderr` contém
    `Invalid catalog: capability 'ticket-classifier' points to fallback 'gemini-lite', which does not exist`. O processo
    termina sozinho, em poucos segundos, sem ficar escutando.
  - [ ] `invalid-name.json` (`Ticket_Classifier`) e `generic-name.json` (`modelo-1`) → código 1, com a linha que nomeia
    a capacidade.
  - [ ] `max-tokens-too-high.json` → código 1, com a linha que cita `max_tokens` e 8192.
  - [ ] `several-problems.json` → código 1, com uma linha `Invalid catalog:` por problema (três).
  - [ ] Com o `GEMINI_API_KEY` vazio no ambiente do processo (`GEMINI_API_KEY= node …`, no Git Bash) e o catálogo
    versionado:
    - sai com código 1;
    - pode sair pela configuração (`Missing or invalid environment variable: GEMINI_API_KEY`, F01), que roda antes;
    - o teste unitário prova a linha do catálogo para uma credencial citada só nele;
    - nenhum valor de variável aparece na saída.
  - [ ] O catálogo versionado tem as três capacidades e os cinco deployments da spec (§5), com os preços, os
    `fixed_params` e o mapeamento `max_tokens` → `max_completion_tokens` nos deployments OpenAI.

### Surface: `API-01` — API administrativa do catálogo
- **Estado inicial:** ambiente do `./dev.sh` no ar; nenhuma linha em `catalog_suspensions`; nenhuma chave
  `catalog:cooldown:*`.
- **Comportamentos:**
  - [ ] `GET /admin/catalog` sem `Authorization` → 401 `invalid_admin_key`.
  - [ ] `GET /admin/catalog` com a master key → 200:
    - `developer-assistant`, `architecture-advisor` e `ticket-classifier`, nessa ordem, com os primários, os fallbacks,
      os timeouts, os retries e os `max_tokens` da spec;
    - os cinco deployments com provedor, modelo e preços;
    - tudo `active`;
    - nenhum campo `credential_env`;
    - header `x-request-id`.
  - [ ] `POST /admin/capabilities/developer-assistant/suspend` com `reason` e `actor` → 200, com `state: suspended` e o
    motivo. O `GET` seguinte mostra suspenso.
  - [ ] `POST /admin/capabilities/developer-assistant/resume` com `actor` → 200 `active`. O `GET` seguinte mostra ativo.
  - [ ] O mesmo para `POST /admin/deployments/gemini-2-5-flash/suspend` e `/resume`.
  - [ ] Suspender de novo um recurso suspenso, ou reativar um ativo → 409 `invalid_state`. O motivo original continua.
  - [ ] Sem `reason`, com `reason` de 201 caracteres, sem `actor`, ou com um campo fora da tabela (`foo`) → 400
    `invalid_value`, citando o campo. Nada é gravado.
  - [ ] `POST /admin/capabilities/nao-existe/suspend` e `POST /admin/deployments/nao-existe/suspend` → 404
    `not_found`. Nada é gravado.
  - [ ] Suspender o primário de uma capacidade sem fallback é aceito (200), com o aviso
    *"A capacidade 'x' ficará indisponível enquanto o deployment estiver suspenso."*
    - No runtime, o catálogo versionado não tem capacidade sem fallback. O equivalente é suspender o fallback
      `gemini-2-5-flash` e depois o primário `openai-gpt-4-1-mini`: o aviso cita `developer-assistant`.
    - O caso literal está no teste de integração com `no-fallback.json`.
    - Ao fim, reative os dois.
  - [ ] Com o Redis parado (`docker compose -p ai-gateway-infra stop redis`):
    - um `suspend` → 503 `catalog_state_unavailable` em até 3 s, sem ficar esperando o Redis voltar;
    - nenhuma linha entra em `catalog_suspensions`;
    - depois de `docker compose -p ai-gateway-infra start redis` e do Redis `healthy`, o `GET /admin/catalog` mostra o
      recurso `active`.

### Surface: `State-01` — persistência e réplica
- **Estado inicial:** como no `API-01`.
- **Comportamentos:**
  - [ ] Depois de um `suspend`, `catalog_suspensions` tem uma linha com tipo, nome, motivo, autor e data. Depois do
    `resume`, a linha some.
  - [ ] O Redis tem o hash `catalog:suspensions` (`HGETALL`, comando no Environment Contract), com o sentinela
    `_loaded` e o campo do recurso suspenso, com o mesmo `suspended_at` da linha do MySQL.
  - [ ] Suspensão mantida em três situações:
    - depois de `docker compose -p ai-gateway-app restart ia`;
    - depois de apagar o hash (`DEL catalog:suspensions`, comando no Environment Contract);
    - depois de `./dev.sh --down` seguido de `./dev.sh` (o Redis não tem persistência, então a recarga vem do MySQL).

    Nas três, o `GET /admin/catalog` continua mostrando o recurso suspenso, com o mesmo motivo. Ao fim, reative.
  - [ ] Com o cooldown de 30 s gravado pelo comando do Environment Contract:
    - o `GET /admin/catalog` mostra o deployment em `cooldown`, com `cooldown_until`;
    - depois de 30 s, ele volta a `active`.

### Surface: `Config-01` — configuração e documentação
- **Estado inicial:** árvore do `main` com a F02.
- **Comportamentos:**
  - [ ] `CATALOG_FILE` está nos três `apps/ia/config/.env.*.example`, com o valor `catalog/catalog.json`, e é lida só
    pelo `src/config/env`.
  - [ ] O `README.md` explica onde fica o catálogo, como reiniciar o proxy depois de editá-lo, o `CATALOG_FILE`, a
    recusa de um catálogo inválido e como suspender e reativar pela API.

## Observable Criteria

Rastreio para os critérios de aceite da F02 no PRD (§9) e para as regras da §6:

- [ ] `OC-01` — O catálogo inicial tem exatamente as três capacidades do PRD, e nenhum nome de capacidade cita um
  provedor (PRD AC 1, parte da F02).
  - Evidência: o `GET /admin/catalog` do `API-01`.
  - Evidência: o teste `should reject generic names and provider names`.
  - O `/v1/models` filtrado pela chave fica na F08.
- [ ] `OC-02` — Um catálogo com fallback para um deployment inexistente impede o proxy de subir, e o log cita a
  capacidade e o deployment (PRD AC 2). Evidência: código 1 e a linha com `ticket-classifier` e `gemini-lite` no
  procedimento do `Catalog-01`, e o teste de startup no verde.
- [ ] `OC-03` — Um nome de capacidade fora do kebab-case (3 a 40) ou genérico, ou um `max_tokens` acima de 8.192, impede
  o proxy de subir (PRD AC 3). Evidência: código 1 com as fixtures `invalid-name`, `generic-name` e
  `max-tokens-too-high`, e os testes unitários de nome e de faixa.
- [ ] `OC-04` — Uma capacidade acrescentada só no catálogo aparece depois de reiniciar o proxy (PRD AC 4, parte da F02;
  demo D5).
  - Evidência: o teste `should list a capability added only in the catalog file`.
  - Evidência no runtime: uma instância temporária no host com
    `CATALOG_FILE=__tests__/fixtures/catalog/extra-capability.json PORT=3141`, para não disputar a 3131 com o
    container; o `GET /admin/catalog` dela lista `release-notes-writer`. Encerre a instância depois.
  - O uso pelo `/v1` fica na F08, e o pelo script e pelo sistema web na F11.
- [ ] `OC-05` — Suspender uma capacidade muda o estado em até 1 s, e reativá-la volta ao ativo em até 1 s (PRD AC 5,
  parte da F02).
  - Evidência: o `API-01`, onde o `GET` logo depois de cada `POST` já mostra o novo estado.
  - Evidência: o teste `should suspend and resume a capability within 1 s`, com o tempo medido.
  - O 503 no `/v1` fica na F08.
- [ ] `OC-06` — Uma suspensão continua valendo depois de reiniciar o proxy (PRD AC 6). Evidência: as três situações do
  `State-01` e o teste `should keep a suspension after the replica is lost`.
- [ ] `OC-07` — Suspender um recurso inexistente retorna 404 (PRD AC 7). Evidência: 404 `not_found` para capacidade e
  deployment inexistentes, sem linha gravada.
- [ ] `OC-08` — Suspender o primário de uma capacidade sem fallback é aceito, com o aviso do PRD (regra de erro da F02).
  Evidência: o teste com `no-fallback.json` e o equivalente de runtime do `API-01`.
- [ ] `OC-09` — Credencial ausente no ambiente, nome duplicado e valor fora das faixas impedem a partida, com o campo
  com problema no log e sem valores de credencial (regra "Validação na inicialização"). Evidência: os testes unitários
  correspondentes e o procedimento do `Catalog-01`.
- [ ] `OC-10` — Os erros dos endpoints do catálogo seguem o formato do proxy:
  - 401 `invalid_admin_key`;
  - 400 `invalid_value`, citando o campo;
  - 409 `invalid_state`;
  - 503 `catalog_state_unavailable` em até 3 s, sem esperar o Redis ou o MySQL voltarem, e sem alteração quando a falha
    acontece antes do `COMMIT` (o caso do Redis parado). O caso do `COMMIT` sem confirmação, com mensagem própria, é
    provado pelos testes unitários.

  Todos levam `x-request-id`. Evidência: o `API-01` e os testes do controller.
- [ ] `OC-11` — A suspensão fica no MySQL e é replicada no Redis, e o cooldown é lido só do Redis (regra "Estado em tempo
  real"). Evidência: o `State-01` (linha e hash; cooldown aparece e expira).
- [ ] `OC-12` — O catálogo versionado traz os deployments, os preços e os parâmetros da spec (§5). Inclui o mapeamento
  `max_tokens` → `max_completion_tokens` na OpenAI e o `reasoning_effort` no Gemini. Evidência: o `GET /admin/catalog`
  comparado com a tabela da spec.
- [ ] `OC-13` — `CATALOG_FILE` está nos três modelos `.env.*.example` do proxy, e o README documenta o catálogo (regras do
  `CLAUDE.md`). Evidência: o `Config-01`.

## Test-suite hint

A F02 não tem tela, então nenhuma linha é `e2e`.

| Superfície / comportamento | Suíte |
|---|---|
| `Catalog-01` — esquema, nomes, faixas, referências, credenciais, relato completo | monorepo unit (`tests-monorepo`) |
| `Catalog-01` — recusa no ponto de entrada (processo filho) e carga do catálogo versionado | integration (`tests-integration-ia`) |
| `Catalog-01` — recusa com o `.env.development` real e o container `healthy` | runtime-only |
| `API-01` — status, corpos, mensagens, avisos | monorepo unit (`tests-monorepo`) + integration (`tests-integration-ia`) |
| `API-01` — 503 com o Redis parado ou lento | monorepo unit (comando recusado e prazo estourado) + integration (`getRedis` com porta fechada) + runtime-only (`stop redis`) |
| `State-01` — linha no MySQL, réplica, recarga, cooldown | integration (`tests-integration-ia`) |
| `State-01` — reinício do container e `./dev.sh --down`/`./dev.sh` | runtime-only |
| `Config-01` — modelos `.env` e README | runtime-only (inspeção) |
| `GET /admin/catalog` — crescimento de consultas | não se aplica: endpoint do proxy, fora do escopo da checagem do `GATES.md`; no máximo 1 consulta (spec §7) |
