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
