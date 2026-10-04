# F03 — Checklist dos testes unitários

Gerado com as regras da skill `monorepo-unit-test-writer` (stack `node-express`), em modo autônomo, durante o
`implement-feature` da F03. O código dos testes é em inglês.

## `apps/ia_simulator/__tests__/unit/`

### `lib/api-error.test.ts` → `src/lib/api-error.ts`
Mocks: nenhum módulo; o `res` é um objeto com `status` (encadeado) e `json` simulados.
- [x] `sendApiError` grava o status e o corpo `{ error: { message, type, code } }`, uma vez, e não devolve nada
- [x] sem `type`, ele vem do status: 400, 404, 413, 429 e 499 → `invalid_request_error`; 500, 502 e 503 →
      `server_error` (a fronteira 499/500 coberta)
- [x] um `type` explícito vence o derivado do status, nos dois sentidos (4xx com `server_error` e 5xx com
      `invalid_request_error`)
- Cobertura do `src/lib/api-error.ts`: 100% em linhas, funções e branches

### `middleware/error-handler.middleware.test.ts` → `src/middleware/error-handler.middleware.ts`
Mocks: `logger` (`error`); `req`, `res` (`status` encadeado, `json`, `headersSent`) e `next` simulados. Os erros do
body-parser são `Error` com o campo `type`.
- [x] `notFound` responde 404 `{ message: 'Unknown route.', type: 'invalid_request_error', code: 'not_found' }`,
      sem log
- [x] com os headers já enviados, chama `next(error)` uma vez e não escreve nada nem registra log
- [x] `entity.parse.failed` → 400 `invalid_json`, sem `next` e sem log
- [x] `entity.too.large` → 413 `request_too_large`, sem `next` e sem log
- [x] qualquer outro erro → `logger.error({ err }, 'Unhandled error')` e 500 `internal_error` com `server_error`,
      sem `next`
- [x] um `type` do body-parser fora dos dois mapeados (`charset.unsupported`) cai no 500 `internal_error`, com log
- Cobertura do `src/middleware/error-handler.middleware.ts`: 100% em linhas, funções e branches

### `app.test.ts` → `src/app.ts`
Mocks: `logger` (`error`), para isolar o app do `config/env` e do `loader`. As requisições passam pelo supertest, sem
porta aberta.
- [x] `GET /health/live` continua respondendo 200 `{ status: 'ok' }`, sem o header `x-powered-by`
- [x] rota desconhecida (`GET /nope`) → 404 em JSON no formato da OpenAI (`not_found`), sem `x-powered-by`
- [x] corpo JSON truncado (`{"model":`, com `Content-Type: application/json`) → 400 `invalid_json`, sem log
- [x] corpo com um primitivo JSON (`123`) → 400 `invalid_json` (parser estrito do Express)
- [x] corpo JSON válido de 2 MB + 1 byte (2.097.153 bytes, tamanho conferido no teste) → 413 `request_too_large`,
      sem log
- [x] corpo de exatamente 2 MB é aceito pelo parser e segue para as rotas (chega ao 404, porque a rota não existe)
- [x] `should answer invalid JSON, a large body and an unknown route in the OpenAI format` (nome da §7 da spec): os
      três casos juntos, com 400/413/404, os códigos e só as chaves `code`, `message` e `type` no `error`
- Cobertura do `src/app.ts`: 100% em linhas, funções e branches

Suíte unitária inteira do app (`npx jest __tests__/unit/ --coverage`): 6 arquivos, 38 testes, 100% em linhas,
funções, branches e statements sobre `src/**`.
