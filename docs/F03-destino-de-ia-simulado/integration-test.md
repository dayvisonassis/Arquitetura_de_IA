# F03 — Checklist dos testes de integração

Escritos pelo próprio `implement-feature` (fallback): nenhuma skill de teste cobre `apps/ia_simulator/__tests__/integration`
nem `apps/ia/__tests__/integration` (`GATES.md`, "Testes e cobertura"). O código dos testes é em inglês.

## `apps/ia_simulator/__tests__/integration/`

Rodam no gate `tests-integration-ia_simulator`, sem infraestrutura. O helper `__tests__/utils/simulator-process.ts` sobe
o `index.ts` real como processo filho (`process.execPath` com `-r ts-node/register/transpile-only`, sem shell), em
`127.0.0.1` e numa porta livre, espera o `/health/live` por até 20 s e encerra o processo no `afterAll`.

### `simulator.test.ts` → o processo real, pela rede
Cada teste começa com `POST /control/reset` (204).
- [x] sobe numa porta livre e responde ao health check
- [x] rota desconhecida → 404 no formato de erro da OpenAI
- [x] `ok` com a requisição da spec (§5): 200 `chat.completion`, `id` `chatcmpl-sim-` + 32 hexadecimais, conteúdo
      `Resposta simulada.`, `finish_reason: stop` e `usage` 10/5/15 (critério 1)
- [x] `error` 503: três chamadas, três 503 com o corpo da tabela, e `calls: 3` no `GET /control/stats` (critério 2)
- [x] `slow` com `delay_ms: 15000`: a resposta chega entre 15.000 e 20.000 ms depois do envio (critério 3)
- [x] `timeout`: o cliente desiste depois de 1 s sem resposta; uma chamada a outro modelo recebe 200; a chamada sem
      resposta conta no `stats`
- [x] `fenced-json`: o conteúdo começa com a cerca `json` e termina com a de fechamento, e o miolo é a resposta da D7
      (critério 4)
- [x] `error` 429 com `retry_after_seconds: 2` e `times: 1`: 429 com `Retry-After: 2`, e a chamada seguinte recebe 200
