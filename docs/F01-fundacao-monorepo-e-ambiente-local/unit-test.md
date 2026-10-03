# F01 — Checklist dos testes unitários

Gerado pelas skills `unit-test-writer` (backend) e `monorepo-unit-test-writer` (`ia`, `ia_simulator`), em modo
autônomo, durante o `implement-feature` da F01. O código dos testes é em inglês.

## Backend (`apps/backend/__tests__/unit/`)

### `config/env.test.js` → `src/config/env.js`
Mocks: `loader` (o teste não lê o `.env.testing` local); `process.env` trocado e restaurado por teste.
- [x] `assertConfig` aceita um ambiente completo e as variáveis opcionais ausentes
- [x] `assertConfig` lê o `process.env` quando chamado sem argumento
- [x] variável obrigatória ausente e vazia → erro com o nome, sem o valor de nenhuma variável
- [x] a primeira variável inválida na ordem da spec é a reportada
- [x] master key e segredo do JWT com 31 caracteres → erro com o nome
- [x] `KEY_ENCRYPTION_KEY` com 63 hex e com caractere não hex → erro com o nome
- [x] `REDIS_DB` fora de 0..15 e não inteiro; `GATEWAY_URL`/`FRONTEND_ORIGIN` que não são URL http(s);
      `GATEWAY_TIMEOUT_MS` = 0; `PORT` fora da faixa; `LOG_LEVEL` desconhecido
- [x] `config`: padrões do que não é segredo, valores lidos do ambiente, `LOG_LEVEL` inválido cai em `info`,
      objeto congelado

### `logger/index.test.js` → `src/logger/index.js`
Mocks: `config`.
- [x] usa o nível de `config.logLevel`
- [x] fica silencioso quando `config.nodeEnv` é `testing`

### `utils/uuid.utils.test.js` → `src/utils/uuid.utils.js`
Sem dependências.
- [x] ida e volta nos três formatos do `IS_UUID()` (32 hex, `8-4-4-4-12`, `{8-4-4-4-12}`), com maiúsculas
- [x] `uuidToBin` devolve 16 bytes
- [x] `uuidToBin` recusa `null`, `undefined`, número e texto malformado com `TypeError('Invalid UUID')`, sem ecoar a
      entrada
- [x] `binToUuid(null)` → `null`; buffer de outro tamanho ou valor que não é buffer → `TypeError`

### `app.test.js` → `src/app.js` (pipeline completo)
- [x] 404 `{ message }` com `x-request-id`; `/v2` montado e vazio (404)
- [x] `x-request-id` também em 400 (JSON inválido) e 403 (outra origem); ID válido ecoado
- [x] `GET /health/live` 200; sem `x-powered-by`

### `middleware/request-id.middleware.test.js`
- [x] `should echo a valid incoming x-request-id`
- [x] `should replace an invalid x-request-id` (maiúsculas, 31 caracteres, só zeros, ausente)
- [x] grava em `req.id` e no header antes do `next()`; `isValidRequestId` por caso

### `middleware/cors.middleware.test.js`
Mocks: `config` (`frontendOrigin`). App Express mínimo com o middleware.
- [x] `should allow the configured frontend origin` (preflight 204 e GET)
- [x] `should refuse another origin with 403` (sem `Access-Control-Allow-Origin`, rota não alcançada)
- [x] `should let requests without Origin through`

### `middleware/error-handler.middleware.test.js`
Mocks: `logger`; `req`/`res`/`next`.
- [x] 404, 400 de JSON inválido e 500 sem stack, registrado com o `req.id` (por `req.log` ou pelo logger)
- [x] resposta já enviada → delega ao `next(error)`

### `controllers/health.controller.test.js`
Mocks: `health.service`.
- [x] `live` 200; `ready` 200 com os checks; 503 com `message`, `status` e checks, com e sem `req.log`

### `services/health.service.test.js`
Mocks: `database` (builder novo por chamada), `redis-client`, `config`.
- [x] tudo `ok`, consultando o `information_schema.SCHEMATA` do schema configurado pela conexão de leitura
- [x] `should return 503 when MySQL fails` (rejeição, schema invisível, `getDb` que lança)
- [x] Redis que rejeita ou responde outra coisa → `fail`
- [x] `should time out a hanging check after 2 s` (fake timers)

### `services/ia-gateway.client.test.js`
Mocks: `fetch` global (respostas `Response` reais).
- [x] `should send the master key and request id`; sem chave, sem `Authorization`; corpo JSON com `content-type`
- [x] 2xx → `{ status, body, requestId }` (do header, ou o enviado)
- [x] `should raise GatewayError with code and request id on 401`; corpo que não é JSON → `gateway_error`
- [x] `should map a network failure to gateway_unreachable` (rejeição, timeout, corpo interrompido)

## Proxy (`apps/ia/__tests__/unit/`), stack `node-express`

### `config/env.test.ts` → `src/config/env.ts`
Mocks: `loader`; `process.env` trocado e restaurado; módulo recarregado com `jest.isolateModulesAsync`.
- [x] ambiente completo aceito; sem argumento, lê o `process.env`
- [x] variável ausente ou vazia → `ConfigError` com o nome, sem valores; ordem da spec
- [x] master key com 31 caracteres; `REDIS_DB`, portas e `LOG_LEVEL` inválidos; chaves dos provedores ausentes
- [x] `config`: padrões, valores lidos, `LOG_LEVEL` inválido cai em `info`, congelado

### `logger/index.test.ts` → `src/logger/index.ts`
- [x] nível de `config.logLevel`; silencioso em `testing`

### `utils/uuid.utils.test.ts` → `src/utils/uuid.utils.ts`
- [x] mesmos casos do backend

### `setup-tests.guard.test.ts` → `__tests__/setupTests.ts`
- [x] `fetch` (URL em texto, `URL` e `Request`) para os dois hosts dos provedores rejeita com um erro que nomeia o host
- [x] `http`/`https` `request` e `get` (URL em texto, `URL`, opções com `hostname` e `host` com porta) para os dois
      hosts lançam o mesmo erro
- [x] outro host não é afetado: `fetch` e `http.get` para um servidor local respondem 200

### `app.test.ts` → `src/app.ts` (pipeline completo)
Mocks: `config` (master key conhecida, sem depender do `.env.testing`).
- [x] 404 `not_found` com `x-request-id`; ID válido ecoado; sem `x-powered-by`
- [x] `should answer 401 without the master key` / `with a wrong one` em `GET /admin/domains`
- [x] `should answer 404 not_found with the right key`; JSON inválido → 400 `invalid_request`

### `middleware/request-id.middleware.test.ts`
- [x] mesmos casos do backend

### `middleware/admin-auth.middleware.test.ts`
Mocks: `config`; `crypto.timingSafeEqual` espionado sobre a implementação real.
- [x] 401 sem chave, com chave errada, com cabeçalho malformado e sem chave configurada; `next()` com a chave certa
- [x] `should compare keys in constant time` (digests SHA-256 de 32 bytes nos dois lados)

### `middleware/error-handler.middleware.test.ts`, `lib/api-error.test.ts`
- [x] 404 `not_found`, 400 `invalid_request`, 500 `internal_error` registrado com o `req.id`; resposta já enviada
- [x] `type` derivado do status, inclusive os não mapeados (4xx e 5xx)

### `controllers/health.controller.test.ts`, `services/health.service.test.ts`
Mocks: `health.service`; `database` (builder novo por chamada), `redis-client`, `config`.
- [x] 200 com os checks; 503 no formato de health, sem `message`
- [x] MySQL e Redis em falha, `getDb` que lança, e o timeout de 2 s (fake timers)

## Simulador (`apps/ia_simulator/__tests__/unit/`), stack `node-express`

Infra criada: `__tests__/setupTests.ts` (força `NODE_ENV=testing`, para os logs ficarem desligados nos testes).

### `config/env.test.ts` → `src/config/env.ts`
- [x] sem variáveis obrigatórias; `PORT` e `LOG_LEVEL` inválidos → `ConfigError` com o nome
- [x] `config`: padrões (porta 3132), valores lidos, congelado

### `logger/index.test.ts` → `src/logger/index.ts`
- [x] nível de `config.logLevel`; silencioso em `testing`

### `app.test.ts`, `controllers/health.controller.test.ts`
- [x] `GET /health/live` → 200 `{ "status": "ok" }`, sem `x-powered-by`; rota inexistente → 404
