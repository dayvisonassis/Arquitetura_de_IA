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
Mocks: `logger` (`info` e `error`), para isolar o app do `config/env` e do `loader`. As requisições passam pelo
supertest, sem porta aberta. O estado do simulador é zerado com `reset()` antes de cada teste.
- [x] `GET /health/live` continua respondendo 200 `{ status: 'ok' }`, sem o header `x-powered-by`
- [x] `should mount the completions and control routes`: `POST /v1/chat/completions` → 200 `chat.completion`;
      `POST /control/modes` → 200; `GET /control/modes` lista o modo; `GET /control/stats` conta a chamada;
      `POST /control/reset` → 204
- [x] só as rotas da spec existem: `GET /v1/chat/completions`, `POST /v1/completions`, `POST /chat/completions`,
      `DELETE /control/modes`, `GET /control/reset` e `POST /control/stats` → 404 `not_found`
- [x] rota desconhecida (`GET /nope`) → 404 em JSON no formato da OpenAI (`not_found`), sem `x-powered-by`
- [x] corpo JSON truncado (`{"model":`, com `Content-Type: application/json`) → 400 `invalid_json`, sem log
- [x] corpo com um primitivo JSON (`123`) → 400 `invalid_json` (parser estrito do Express)
- [x] corpo JSON válido de 2 MB + 1 byte (2.097.153 bytes, tamanho conferido no teste) → 413 `request_too_large`,
      sem log
- [x] corpo de exatamente 2 MB é aceito pelo parser e segue para as rotas (chega ao 404, porque a rota não existe)
- [x] `should answer invalid JSON, a large body and an unknown route in the OpenAI format` (nome da §7 da spec): os
      três casos juntos, com 400/413/404, os códigos e só as chaves `code`, `message` e `type` no `error`
- Cobertura do `src/app.ts`: 100% em linhas, funções e branches

### `lib/wait.test.ts` → `src/lib/wait.ts`
Mocks: nenhum módulo; timers falsos do Jest (sem I/O) e `jest.spyOn` no `addEventListener`/`removeEventListener` do
sinal.
- [x] resolve só depois do tempo pedido (14.999 ms ainda pendente; 15.000 ms resolvido), sem timer sobrando
- [x] resolve com `undefined`
- [x] com o sinal já abortado, resolve na hora, sem timer e sem registrar listener
- [x] o abort no meio da espera resolve antes, sem erro, e limpa o timer
- [x] o listener de `abort` é registrado uma vez, com `{ once: true }`
- [x] quando o tempo acaba, o listener de `abort` é removido; um abort depois disso não tem efeito
- [x] `wait(0)` resolve no próximo tick de timer, não de forma síncrona
- Cobertura do `src/lib/wait.ts`: 100% em linhas, funções e branches

### `services/simulation-state.service.test.ts` → `src/services/simulation-state.service.ts`
Mocks: nenhum. O estado é do módulo, então o `reset()` roda num `beforeEach`.
- [x] `MODES` lista os seis modos da spec
- [x] `setMode` devolve o modo guardado com `model` e `remaining_calls` (`null` sem `times`; igual ao `times` com ele),
      e guarda a configuração sem `model` e sem `times`
- [x] `should replace the mode of a model` (nome da §7): vale o último `setMode`
- [x] trocar o modo não muda as estatísticas
- [x] `should answer ok for a model without a configured mode` (nome da §7): `takeMode` devolve `{ mode: 'ok' }`, sem
      conteúdo
- [x] o nome do modelo é comparado exatamente (maiúsculas e espaço no fim não casam)
- [x] modo sem `times` vale para todas as chamadas, com `remaining_calls` `null`
- [x] `should return to ok after the configured number of calls` (nome da §7): `times: 2` → 2 → 1 → removido →
      `ok`
- [x] `times: 1` remove o modo na primeira chamada; o `times` de um modelo não gasta o de outro
- [x] `recordCall` guarda `received_at` em UTC com milissegundos, o modo e o corpo; sem horário, usa o atual
- [x] `should count every call and keep only the 20 most recent requests` (nome da §7): 25 chamadas → `calls` 25 e os
      itens do 6º ao 25º, em ordem; com exatamente 20, todos ficam
- [x] as estatísticas de cada modelo ficam separadas; `getStats()` começa vazio
- [x] `listModes` inclui um `ok` configurado explicitamente e cada modelo com os seus campos
- [x] `should clear modes and stats on reset` (nome da §7): modos e estatísticas vazios, e o modelo volta ao `ok`
- [x] `should not expose its internal structures` (nome da §7): alterar o retorno de `getStats()` (inclusive o corpo
      aninhado) e de `listModes()` não muda o estado
- [x] o corpo registrado é uma cópia (mudar o original depois não aparece); `setMode` e `takeMode` também devolvem
      cópias
- Cobertura do `src/services/simulation-state.service.ts`: 100% em linhas, funções e branches

### `services/completion.service.test.ts` → `src/services/completion.service.ts`
Mocks: nenhum; o horário entra pelo parâmetro `now`.
- [x] `should count characters as code points rounded up` (nome da §7): `""`, `abc`, `abcd`, `abcde`, `ação` e um
      emoji → 0, 1, 1, 2, 1, 1
- [x] cinco emojis contam 5 caracteres (2 tokens), não 10 unidades UTF-16 (3 tokens)
- [x] `should join the content of every message` (nome da §7): string, lista de partes com `text` e `image_url` e
      `null` → só o texto conta
- [x] as mensagens da §5 viram 40 caracteres, sem separador → 10 tokens
- [x] `content` ausente, lista vazia e string vazia contam zero; lista sem mensagens → texto vazio
- [x] partes que não são `type: text` com `text` string (`null`, string solta, número, sem `type`, sem `text`, `text`
      numérico, `input_text`) são ignoradas
- [x] `responseContent`: padrão e configurado de `ok`, `slow` e `invalid-json`; o padrão do `invalid-json` não é JSON
- [x] `should wrap JSON in a json code fence` (nome da §7): padrão (a resposta da D7) e configurado, com a cerca `json`
      da §5 e o JSON interno válido
- [x] `simulatedError`: o `type`, o `code` e a `message` da tabela da §5 para os oito status (400, 401, 403, 404, 429,
      500, 502 e 503); status fora da tabela (418 e 504) → `undefined`
- [x] `should build an OpenAI chat completion` (nome da §7): `id` `chatcmpl-sim-` + 32 hexadecimais, `object`,
      `created` em segundos Unix, `model`, `choices` e `usage` 10/5/15, nesta ordem de campos
- [x] cada chamada sorteia um `id` novo; sem `now`, `created` é o horário atual
- [x] `should cut the content at the token limit` (nome da §7): limite 2 → `Resposta`, `length`, 2 tokens; limite 4 →
      16 caracteres; limite 5 (exato) e 256 não cortam; sem limite não corta
- [x] o corte respeita pontos de código (não parte um emoji ao meio)
- [x] as crases do `fenced-json` contam no `completion_tokens`; conteúdo vazio não é cortado
- Cobertura do `src/services/completion.service.ts`: 100% em linhas, funções e branches

### `controllers/completions.controller.test.ts` → `src/controllers/completions.controller.ts`
Mocks: `logger` (`info` e `error`) e `src/lib/wait` (`jest.fn`, sem esperar de verdade). O arquivo abre um único
servidor do `app` em `127.0.0.1`, porta livre, fechado no `afterAll`, e usa o supertest sobre ele; o cancelamento usa
o `fetch` com `AbortController`. O estado real é zerado com `reset()` antes de cada teste; os `jest.spyOn` no
`completion.service` e no `takeMode` são restaurados depois de cada teste.
- [x] `should answer ok with deterministic usage` (nome da §7): a requisição da §5 → 200 com o corpo da §5 e `usage`
      10/5/15, sem chamar a espera
- [x] `ok` com `content` configurado; o `model` da resposta é o da requisição
- [x] o log `info` traz modelo, modo, status e atraso, sem o conteúdo das mensagens
- [x] `should accept any or no Authorization header` (nome da §7): sem header, `Bearer x` e `Basic y` → 200 nos três
- [x] corte pela requisição: `max_completion_tokens: 2`, só `max_tokens: 2`, `max_completion_tokens: null` com
      `max_tokens: 2` → `Resposta`, `length`, 2 tokens; `256` com `max_tokens: 2` e os dois `null` → sem corte; sem
      limite → sem corte
- [x] `should answer the configured error with the OpenAI body and Retry-After` (nome da §7): cada um dos oito status
      (400, 401, 403, 404, 429, 500, 502 e 503) com o corpo da tabela e sem `Retry-After`; 429 e 503 com
      `retry_after_seconds: 2` → `Retry-After: 2`
- [x] o 400 simulado (`unsupported_parameter`, sem `Retry-After`) é contado no `GET /control/stats` como `error`, e o
      400 da validação do próprio simulador (`invalid_request`), no mesmo modelo, não é
- [x] `retry_after_seconds: 0` envia `Retry-After: 0`; o log traz o status configurado
- [x] `Retry-After` e volta ao `ok` depois do `times`
- [x] `should wait delay_ms in slow mode` (nome da §7): a espera recebe 15000 e um `AbortSignal` ainda não abortado;
      depois, 200 com o `usage` 10/5/15 e o log com `delay_ms`
- [x] `slow` com `content` configurado e `delay_ms: 0`; a chamada já conta durante a espera
- [x] `should cancel the slow wait when the client closes` (nome da §7): a espera simulada só termina quando o sinal
      aborta; o cliente aborta, o sinal aborta, nada é montado nem escrito, sem log de erro; a chamada conta como
      `slow` e o servidor segue respondendo
- [x] `should not answer in timeout mode` (nome da §7): o cliente desiste em 200 ms sem resposta; `GET /control/stats`
      conta a chamada como `timeout`
- [x] `should answer text that is not JSON in invalid-json mode` (nome da §7): padrão e configurado, com o
      `JSON.parse` falhando
- [x] `fenced-json` pelo endpoint: a cerca `json`, o JSON interno da D7 e as crases contadas no `completion_tokens`
- [x] `should reject an invalid request without counting it` (nome da §7): sem `model`, `messages` vazio,
      `max_tokens: 0` e um corpo que é lista JSON → 400 `invalid_request` com a mensagem citando o campo; nada é
      contado e o `times` configurado não é gasto
- [x] outras recusas: `model` vazio, com 201 caracteres ou numérico; `messages` ausente ou que não é lista; mensagem
      que não é objeto, sem `role` ou com `content` numérico; `max_completion_tokens` decimal ou em string;
      `max_tokens` negativo
- [x] 1.000 mensagens são aceitas e 1.001 recusadas; `model` de 200 caracteres, `content` vazio, `null`, ausente e
      em partes, e campos a mais são aceitos
- [x] `should record the body and the applied mode` (nome da §7): o corpo com `response_format`,
      `max_completion_tokens` e `temperature` é registrado igual, com o modo aplicado (`error` e depois `ok`)
- [x] nenhum header é registrado
- [x] um erro inesperado (`takeMode` que lança) e uma falha da espera chegam ao `next` → 500 `internal_error`, com
      log, sem registro
- Cobertura do `src/controllers/completions.controller.ts`: 100% em linhas, funções e branches

### `controllers/control.controller.test.ts` → `src/controllers/control.controller.ts`
Mocks: `logger` (`info` e `error`). As requisições passam pelo supertest sobre o `app`, com o estado real zerado com
`reset()` antes de cada teste.
- [x] `should validate each mode` (nome da §7): 43 corpos inválidos, cada um com uma única violação da tabela da §5
      (corpo lista; `mode` ausente, desconhecido como `crash`, em maiúsculas ou `null`; `model` ausente, vazio, com
      201 caracteres ou numérico; `times` 0, 1001, decimal, em string ou `null`; `content` vazio, com 20.001
      caracteres ou numérico; `error` sem `status`; `status` 418 ou em string, com a mensagem que lista os oito status;
      `retry_after_seconds` -1, 121, decimal, ou com 500, 401, 502, 400, 403 e 404; `slow` sem `delay_ms`; `delay_ms`
      120001, -1 ou decimal; `content` que não é JSON no `fenced-json`; objeto e número JSON no `invalid-json`; campo
      `foo`; `content`, `status`, `delay_ms` e `retry_after_seconds` fora dos modos deles) → 400 `invalid_value` com a
      mensagem citando o campo; o modo já guardado não muda e nada é registrado no log
- [x] os mesmos 43 casos, um a um, sem nada guardado depois
- [x] as fronteiras aceitas: `model` de 200 caracteres, `times` 1 e 1000, `content` de 20.000 caracteres, `status`
      401, 500 e 502, `retry_after_seconds` 0 com 429 e 120 com 503, `delay_ms` 0 e 120000, `timeout` sem campos, lista
      JSON no `fenced-json` e texto no `invalid-json`
- [x] os status definitivos 400, 403 e 404 são aceitos: 200 com o modo guardado (`remaining_calls: null`), o
      `GET /control/modes` lista o mesmo e a chamada seguinte ao `/v1/chat/completions` responde esse status
- [x] corpo que não é JSON ou primitivo JSON → 400 `invalid_json` do parser, sem nada guardado; corpo `text/plain`
      chega vazio e recebe `The field 'mode' is required.`
- [x] `should store and list a mode` (nome da §7): o exemplo da §5 → 200 com `remaining_calls: 3` e o log
      `Simulation mode set`; o `GET /control/modes` lista o mesmo e, depois de duas chamadas, `remaining_calls: 1`
- [x] sem `times`, `remaining_calls: null`; um `ok` explícito aparece na lista, com cada modelo separado
- [x] um novo `POST` substitui o modo e mantém as estatísticas
- [x] no fim do `times`, o modelo sai da lista e volta ao `ok` com `Resposta simulada.`
- [x] `GET /control/stats`: vazio antes de qualquer chamada; depois, `calls` e `requests` (horário, modo e corpo) de
      cada modelo
- [x] `should reset with 204` (nome da §7): 204 sem corpo, o log `Simulation reset`, e modos e estatísticas vazios;
      o reset de um estado vazio, com corpo, também responde 204
- Cobertura do `src/controllers/control.controller.ts`: 100% em linhas, funções e branches

Suíte unitária inteira do app (`npx jest __tests__/unit/ --coverage`): 11 arquivos, 217 testes, 100% em linhas,
funções, branches e statements sobre `src/**`. Gates `tests-monorepo` e `lint-monorepo` (`apps/ia_simulator`): PASS.
