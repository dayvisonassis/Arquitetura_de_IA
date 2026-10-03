# F01 — Checklist dos testes de integração

Testes contra o MySQL e o Redis de teste (`./dev.sh --infra`), com `NODE_ENV=testing`. O código dos testes é em
inglês.

## Backend (`apps/backend/__tests__/integration/`), pela skill `integration-test-writer`

### `database-isolation.test.js` — grants do `web_app`
Nenhum teste cria dados, então não há limpeza por teste. Sem endpoint: crescimento de consultas não se aplica.

| Teste | Entrada | Esperado |
|---|---|---|
| `web_app should read its own test schema` | `SHOW TABLES FROM web_test` pela conexão de leitura | resolve, com `knex_migrations` (controle positivo: a recusa abaixo não é falha de conexão) |
| `web_app should not read the gateway schema` | `SHOW TABLES FROM gateway` por `db.getDb({ operation: 'read' })` | rejeita com ER 1044 (`ER_DBACCESS_DENIED_ERROR`) |
| `web_app should not read the gateway_test schema` | `SHOW TABLES FROM gateway_test` pela conexão de escrita | rejeita com ER 1044 |
| `web_app should hold no global privilege` | `SHOW GRANTS FOR CURRENT_USER()` | só `USAGE ON *.*` e `ALL PRIVILEGES` em `web` e `web_test` |

### `redis-client.test.js` — cliente Redis do backend

| Teste | Entrada | Esperado |
|---|---|---|
| `should authenticate and answer PING on the test Redis` | `ping()` com a senha e o db 3 do `.env.testing` | `PONG` |
| `should reuse the open connection on the next PING` | dois `ping()` seguidos | `PONG`, sem reconectar |

### `health.test.js` — `/health/*` contra o MySQL e o Redis de teste

Nenhum dado criado. Crescimento de consultas (um desfecho por endpoint):
- `GET /health/live`: `not measurable — source not counted` (não consulta o banco);
- `GET /health/ready`: `not measurable — fixed-size result`.

| Teste | Entrada | Esperado |
|---|---|---|
| `should answer 200 with status ok and a request id` | `GET /health/live` | 200 `{ status: ok }`, `x-request-id` com 32 hex |
| `should report ok with MySQL and Redis up` | `GET /health/ready` | 200, `mysql` e `redis` em `ok` |
| `should stay ok on repeated calls, reusing the connections` | duas chamadas | 200 nas duas |
| `should answer without authentication and outside /v2` | `Authorization` qualquer | 200 |

## Proxy (`apps/ia/__tests__/integration/`), pelo fallback do `implement-feature`

Nenhuma skill cobre os testes de integração do proxy (spec §3). Seguem o mesmo molde do backend.

### `database-isolation.test.ts` — grants do `gateway_app`

| Teste | Entrada | Esperado |
|---|---|---|
| `gateway_app should read its own test schema` | `SHOW TABLES FROM gateway_test` | resolve, com `knex_migrations` |
| `gateway_app should not read the web schema` | `SHOW TABLES FROM web` pela conexão de leitura | ER 1044 |
| `gateway_app should not read the web_test schema` | `SHOW TABLES FROM web_test` pela conexão de escrita | ER 1044 |
| `gateway_app should hold no global privilege` | `SHOW GRANTS FOR CURRENT_USER()` | só `USAGE ON *.*` e `ALL PRIVILEGES` em `gateway` e `gateway_test` |

### `redis-client.test.ts` — cliente Redis do proxy

Os mesmos dois casos do backend, contra o db 2.

### `health.test.ts` — `/health/*` contra `gateway_test` e o Redis db 2

- [x] `GET /health/live` → 200 com `x-request-id`
- [x] `should report ok with MySQL and Redis up`
- [x] `/health/ready` sem master key, em chamadas repetidas
