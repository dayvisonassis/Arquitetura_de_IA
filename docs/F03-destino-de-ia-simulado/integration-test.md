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
- [x] erros definitivos 400, 403 e 404, um modelo por status: o status e o `code` da tabela da spec (o 400 com
      `unsupported_parameter`), sem `Retry-After`, e `calls: 1` em cada modelo (acrescentado com a mudança `98ca35d`)

## `apps/ia/__tests__/integration/`

Roda no gate `tests-integration-ia`, junto com a suíte de integração do proxy (precisa do `./dev.sh --infra`). Fica na
integração porque uma mudança só num JSON de catálogo não dispara o `tests-monorepo`.

### `catalog-simulated.test.ts` → `catalog/catalog.simulated.json`
- [x] o catálogo simulado passa no `assertCatalog` sem `OPENAI_API_KEY` e sem `GEMINI_API_KEY`; o real, com o mesmo
      ambiente, é recusado citando a credencial (prova que o ambiente do teste não tem as chaves)
- [x] espelho do real: todo deployment simulado tem `provider: simulated` e não tem `credential_env`; sem esses dois
      campos, os deployments são iguais e na mesma ordem; as capacidades são iguais. Provado também ao contrário: um
      preço mudado só no simulado faz o teste falhar
- [x] nenhum modelo repetido entre os deployments simulados (os modos do simulador são por modelo)
