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

### `catalog.test.ts` → API do catálogo com o catálogo versionado
Limpeza em `afterEach` pelo `__tests__/utils/catalog-state.ts` (linhas de `catalog_suspensions` e chaves `catalog:*`).
- [x] `GET /admin/catalog` espelha o arquivo versionado (o teste lê e interpreta o próprio `catalog.json`): mesma ordem,
      padrões aplicados, tudo `active`, nenhum `credential_env`, `x-request-id`; as três capacidades do PRD presentes. Não
      fixa modelos nem preços. É este teste que faz uma mudança só no JSON passar pelo `tests-integration-ia`
- [x] sem a master key → 401
- [x] suspender e reativar uma capacidade: cada mudança visível no `GET` seguinte, em menos de 1.000 ms
- [x] suspender e reativar um deployment: a linha existe no MySQL só enquanto suspenso, com o mesmo `suspended_at` da
      resposta
- [x] réplica perdida (`DEL catalog:suspensions`): o `GET` seguinte mostra a suspensão, com o mesmo motivo e instante,
      recarregada do MySQL, e o sentinela volta
- [x] 404 para capacidade e deployment inexistentes, sem linha gravada
- [x] 409 ao suspender duas vezes e ao reativar o que está ativo; o motivo original continua
- [x] 400 sem `reason`, com `reason` de 201 caracteres, sem `actor`, com `actor` inválido e com campo não aceito; nada
      gravado
- [x] cooldown gravado no Redis aparece como `cooldown` com `cooldown_until`

### `catalog-no-fallback.test.ts` → `CATALOG_FILE` = `no-fallback.json`
- [x] suspender o primário de uma capacidade sem fallback é aceito, com o aviso do PRD

### `catalog-extra-capability.test.ts` → `CATALOG_FILE` = `extra-capability.json`
- [x] uma capacidade que só existe no arquivo (`release-notes-writer`) aparece no `GET /admin/catalog` (demo D5, parte
      da F02)

A migration `catalog_suspensions` roda no `migrations:test` antes da suíte. O `down` e o `up` foram conferidos à mão no
`gateway_test`, e o CHECK do `resource_type` recusa um tipo fora da lista (ER 3819).
