# F03 — Checklist dos testes de integração

Escritos pelo próprio `implement-feature` (fallback): nenhuma skill de teste cobre `apps/ia_simulator/__tests__/integration`
nem `apps/ia/__tests__/integration` (`GATES.md`, "Testes e cobertura"). O código dos testes é em inglês.

## `apps/ia_simulator/__tests__/integration/`

Rodam no gate `tests-integration-ia_simulator`, sem infraestrutura. O helper `__tests__/utils/simulator-process.ts` sobe
o `index.ts` real como processo filho (`process.execPath` com `-r ts-node/register/transpile-only`, sem shell), em
`127.0.0.1` e numa porta livre, espera o `/health/live` por até 20 s e encerra o processo no `afterAll`.

### `simulator.test.ts` → o processo real, pela rede
- [x] sobe numa porta livre e responde ao health check
- [x] rota desconhecida → 404 no formato de erro da OpenAI
