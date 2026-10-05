# F04 — Checklist dos testes de integração

Gerado com as regras da skill `integration-test-writer`, em modo autônomo, durante o `implement-feature` da F04. O
código dos testes é em inglês.

Modo: autônomo (implement-feature, F04 fase 3). Checkpoint pulado.
Escopo: `apps/backend/__tests__/integration/`. Spec §5, §6 e §7; contrato Auth-01, Session-01, Authz-01, Boot-01, Data-01.

Regras aplicadas: `setupTestDatabase()` no `beforeAll`, `cleanupTestDatabase()` no `afterAll`, `try/finally` em todo
teste que cria dados, `try/catch` dentro do `finally` (os helpers de exclusão do `permission-helper` já capturam),
ordem de FK `active_sessions` → `role_permissions` de teste → `permissions` de teste → `users` → `platform_users` →
`dr_domain`, só dados criados pelo teste. Contas que são bloqueadas, contadas, trocam de papel ou de domínio são
criadas pelo teste, nunca o usuário compartilhado.

## Crescimento de consultas (um resultado por endpoint)

| Endpoint | Resultado |
|---|---|
| `GET /v2/me` | `should not grow the number of queries with the number of permissions of the role` |
| `POST /v2/auth/login` | `not measurable — write endpoint` |
| `POST /v2/auth/logout` | `not measurable — write endpoint` |

## Lote 1 — `auth-login.test.js` (`POST /v2/auth/login`)

`resetLoginRateLimit()` no `beforeEach` e no `afterAll` (antes do `cleanupTestDatabase`).

| # | Teste | Entrada | Esperado | Status |
|---|---|---|---|---|
| 1 | should log in each identity and create a session | platform admin e usuário de domínio criados pelo teste, senha certa | 200, `token`, `expires_at` +8 h truncado ao segundo, `Cache-Control: no-store`, linha em `active_sessions` do dono certo com o mesmo `expires_at`, JWT `{ data: { session_id, user } }` com `exp` = `expires_at` em segundos | passou |
| 2 | should compare the e-mail case-insensitively and without surrounding spaces | e-mail em maiúsculas com espaços | 200 e sessão do usuário | passou |
| 3 | should store the password as a bcrypt hash of cost 10 | login certo | `password_hash` `$2b$10$`, `getRounds` 10, hash inalterado depois do login, senha nunca em texto | passou |
| 4 | should answer the same 401 for a wrong password and an unknown e-mail | senha errada / e-mail inexistente | 401 e corpos iguais (`E-mail ou senha inválidos.`) | passou |
| 5 | should refuse a password over 72 bytes at login as a wrong password | hash da conta = bcrypt de 36 × `ç` (72 bytes); login com 40 × `ç` (80 bytes), que o bcrypt aceitaria por truncar | 401 e `failed_attempts` 1 | passou |
| 6 | should lock on the fifth consecutive failure even for the right password | 4 erradas, a 5ª errada, a 6ª certa | 401 × 4 com contador 1..4; 423 com `locked_until` ≈ +15 min e `HH:MM` de `America/Sao_Paulo`; contador 0; 6ª certa 423 sem sessão | passou |
| 7 | should let the user in after the lock expires | `failed_attempts` 2 e `locked_until` no passado | 200, contador 0, `locked_until` nulo, `last_login_at` preenchido | passou |
| 8 | should refuse the login of a user whose domain is inactive or removed | domínios `inactive` e `removed`, senha certa, contador 2 | 403 com a mensagem do PRD, nenhuma sessão, contador 0 | passou |
| 9 | should answer 400 to %s (8 casos: corpo vazio, sem senha, sem e-mail, e-mail não string, senha não string, senha vazia, e-mail só de espaços, e-mail > 254) | `{}`, sem senha, sem e-mail, tipos errados, e-mail > 254 | 400 `Informe o e-mail e a senha.` | passou |
| 10 | should answer 400 to an invalid JSON body | JSON quebrado | 400 `JSON inválido.` | passou |
| 11 | should answer 429 on the 21st attempt from the same IP | `config.loginRateLimit.max` tentativas com e-mail inexistente, depois mais uma | nenhuma 429 nas `max`; a seguinte 429 com a mensagem e `Retry-After` > 0 | passou |

## Lote 2 — `auth-session.test.js` (autenticação e logout)

| # | Teste | Entrada | Esperado | Status |
|---|---|---|---|---|
| 1 | should answer 401 without a token, with a tampered token and with a revoked session | sem header; payload trocado sem nova assinatura; sessão com `revoked_at` | 401 `Sua sessão expirou. Entre novamente.` nos três | passou |
| 2 | should answer 401 to a malformed or unknown credential | `Token <jwt>`, `Bearer` vazio, `Bearer not-a-jwt`, JWT com `session_id` que não é UUID, JWT de sessão inexistente | 401 | passou |
| 3 | should refuse a session older than 8 hours | `generateToken` com `expiresAt` no passado | 401 | passou |
| 4 | should refuse a token whose session expired in the database | `expires_at` da sessão movido para o passado, JWT válido | 401 | passou |
| 5 | should refuse an expired JWT of a session still valid in the database | JWT assinado com `exp` no passado para sessão válida | 401 | passou |
| 6 | should refuse a token whose user does not own the session | sessão de A, JWT com o id de B | 401 | passou |
| 7 | should revoke the session on logout | logout | 204 sem corpo, `revoked_at` e `revoked_reason = logout`, depois 401 no `/v2/me` e no logout | passou |
| 8 | should answer 401 to a logout without a token | sem header | 401 | passou |
| 9 | should refuse the next request after the domain becomes inactive | domínio e usuário do teste, status → `inactive` | 200 antes, 401 depois | passou |
| 10 | should refuse the next request after the domain is removed | status → `removed` | 401 | passou |

## Lote 3 — `me.test.js` (`GET /v2/me`)

| # | Teste | Entrada | Esperado | Status |
|---|---|---|---|---|
| 1 | should return name, role, domain and permissions of the platform admin | token de plataforma | corpo exato, `domain: null`, `['users.read']` | passou |
| 2 | should return name, role, domain and permissions of the domain admin | usuário compartilhado | corpo exato, `['playground.read','users.read']` | passou |
| 3 | should return name, role, domain and permissions of the user | usuário do teste | corpo exato, `['playground.read']` | passou |
| 4 | should ignore X-Domain-Id | header com outro domínio | o domínio da sessão / `null` | passou |
| 5 | should reflect a role change on the next request | `users.role` trocado no banco, mesmo token | papel e permissões novos | passou |
| 6 | should not grow the number of queries with the number of permissions of the role | permissões de teste 990001..990005 (área única por linha) mapeadas ao papel `user` de um usuário do teste: 1, chamada não medida, medida; +4, chamada não medida, medida | mesmo número de consultas (`toHaveLength`), segunda resposta com 4 permissões a mais | passou |

## Lote 4 — `authorization.test.js` (middlewares montados no teste + CORS no app real)

App do teste: `express.json()`, `authenticate` real, `GET /shared` com `checkPermission('users','read')`, `GET /platform`
com `requirePlatformAdmin`, handler `{ domainId: req.domainId }`, `errorHandler` real.

| # | Teste | Entrada | Esperado | Status |
|---|---|---|---|---|
| 1 | should answer 403 to a user on a route that requires users.read | papel `user` | 403 `Você não tem permissão para acessar esta página.` | passou |
| 2 | should let a domain admin in with its own domain | usuário compartilhado | 200 `{ domainId }` do domínio dele | passou |
| 3 | should ignore X-Domain-Id for a domain user | header de outro domínio e header inválido | 200 com o domínio da sessão | passou |
| 4 | should validate X-Domain-Id for the platform admin | sem header; `not-a-uuid`, UUID aleatório, domínio `removed`; domínio ativo e `inactive` | 400 `Escolha um domínio.`; 404 `Domínio não encontrado.` nos três; 200 com o id do header nos dois | passou |
| 5 | should answer 403 to a domain admin on a platform route | `domain_admin` | 403 | passou |
| 6 | should answer 403 to a user on a platform route | `user` | 403 | passou |
| 7 | should let the platform admin in on a platform route | platform admin | 200 `{ domainId: null }` | passou |
| 8 | should allow the x-domain-id header in a preflight from the frontend origin | `OPTIONS /v2/me` de `http://127.0.0.1:4200` (app real) | 204, `access-control-allow-origin` e `x-domain-id` nos headers permitidos | passou |

## Lote 5 — `platform-admin-bootstrap.test.js`, `permissions-catalog.test.js`, `redis-client.test.js`

| # | Teste | Entrada | Esperado | Status |
|---|---|---|---|---|
| 1 | (precondição) `platform_users` vazia | contagem | falha com mensagem clara se não estiver vazia | passou |
| 2 | should create the platform admin once and leave it unchanged on the next start | e-mail com maiúsculas e espaços; segunda chamada com outras credenciais | `{ created: true, id }`, 1 linha, e-mail normalizado, nome, papel, `$2b$10$`; depois `{ created: false }`, 1 linha, `updated_at` e `password_hash` iguais | passou |
| 3 | should refuse a platform admin e-mail already used by a domain user | e-mail de usuário de domínio do teste | erro `PLATFORM_ADMIN_EMAIL is already used by a domain user`, nada criado | passou |
| 4 | should report an e-mail taken in either identity | e-mails das duas identidades, inexistente, com `trx` | `true`, `true`, `false`, `true` dentro da transação | passou |
| 5 | should hold the F04 permission rows | `permissions` 400 e 401 | `users/read`, `playground/read` | passou |
| 6 | should map the F04 permissions to the roles | `role_permissions` de 400 e 401 | domain_admin 400+401, platform_admin 400, user 401 | passou |
| 7 | getClient should connect on demand and return a ready client | depois de `quit()` | cliente `isReady`, `PING` → `PONG` | passou |
| 8 | getClient should resolve concurrent calls to the same client | 3 chamadas simultâneas depois de `quit()` | a mesma instância | passou |
| 9 | getClient should return the ready client on later calls | duas chamadas seguidas | a mesma instância | passou |
| 10 | getClient should open a new client after quit | `quit()` entre duas chamadas | cliente antigo fechado, novo cliente responde `PONG` | passou |

## Execução

- Cada lote rodado sozinho com `NODE_ENV=testing`, `--runInBand --forceExit --detectOpenHandles --no-coverage`: verde.
- A contagem do teste de crescimento foi conferida à parte (2 consultas nas duas medições: a sessão com a identidade e as
  permissões do papel), para garantir que a medição não é vazia.
- `npm run test:integration` (suíte inteira) duas vezes seguidas: 9 suítes, 61 testes, verde nas duas.
- Depois das duas rodadas, o `web_test` ficou só com os fixtures compartilhados (1 domínio, 1 usuário), o catálogo da
  F04 (2 permissões, 4 linhas do mapa), `platform_users` e `active_sessions` vazias, e nenhuma chave `rl:auth:*` no
  Redis de teste.
- Prettier (`--config apps/backend/.prettierrc`) e ESLint `--max-warnings 0` limpos nos sete arquivos.
