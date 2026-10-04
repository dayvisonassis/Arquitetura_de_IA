# F02 — Checklist dos testes de integração

Escritos pelo próprio `implement-feature` (fallback): nenhuma skill de teste cobre `apps/ia/__tests__/integration`
(`GATES.md`, "Testes e cobertura"). Rodam no gate `tests-integration-ia`, contra o `gateway_test` e o Redis db 2, com o
`apps/ia/.env.testing` local (`./dev.sh --infra` no ar). O código dos testes é em inglês.

## `apps/ia/__tests__/integration/`

### `catalog-startup.test.ts` → `index.ts` (processo filho)
Roda `node -r ts-node/register/transpile-only index.ts` por `spawnSync`, sem shell, com `NODE_ENV=testing` e o
`CATALOG_FILE` apontando para uma fixture de `__tests__/fixtures/catalog/`.
- [x] `fallback-missing.json`, `invalid-name.json` e `max-tokens-too-high.json`: o processo sai sozinho antes do prazo
      de 20 s, com código 1 e a linha `Invalid catalog:` esperada
- [x] `several-problems.json`: três linhas `Invalid catalog:`, uma por problema

### `redis-client.test.ts` → `redis-client.ts` (acréscimos da F02)
- [x] `getRedis()` chamado duas vezes em paralelo devolve o mesmo cliente, com o mesmo `CLIENT ID`. O `CLIENT LIST` não
      é contado, porque mostra todos os bancos, e o container do proxy do `./dev.sh` tem uma conexão com o mesmo nome
- [x] com `REDIS_PORT` numa porta fechada, num registro de módulos isolado e fechado com `quit()`, o `getRedis()` rejeita
      com `Redis is not ready` em menos de 3 s

A migration `catalog_suspensions` roda no `migrations:test` antes da suíte. O `down` e o `up` foram conferidos à mão no
`gateway_test`, e o CHECK do `resource_type` recusa um tipo fora da lista (ER 3819).
