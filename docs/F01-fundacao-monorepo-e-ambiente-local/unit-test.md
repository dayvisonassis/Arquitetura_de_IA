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

## Simulador (`apps/ia_simulator/__tests__/unit/`), stack `node-express`

Infra criada: `__tests__/setupTests.ts` (força `NODE_ENV=testing`, para os logs ficarem desligados nos testes).

### `config/env.test.ts` → `src/config/env.ts`
- [x] sem variáveis obrigatórias; `PORT` e `LOG_LEVEL` inválidos → `ConfigError` com o nome
- [x] `config`: padrões (porta 3132), valores lidos, congelado

### `logger/index.test.ts` → `src/logger/index.ts`
- [x] nível de `config.logLevel`; silencioso em `testing`
