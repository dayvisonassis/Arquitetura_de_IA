# F04 — Checklist dos testes unitários

Gerado com as regras da skill `unit-test-writer`, em modo autônomo, durante o `implement-feature` da F04 (uma seção
por etapa). O código dos testes é em inglês.

## Etapa 1

### utils/password.utils.js (novo)
- [ ] validatePassword: aceita 10 e 64 caracteres ASCII (limites)
- [ ] validatePassword: min_length para 9 caracteres, string vazia e não string (undefined, null, número, objeto)
- [ ] validatePassword: max_length para 65 caracteres (max_length vem antes de max_bytes)
- [ ] should reject a password of 64 characters or less over 72 bytes (40 x 'ç')
- [ ] validatePassword: aceita exatamente 72 bytes (36 x 'ç'), max_bytes em 74 bytes
- [ ] should count characters as code points (10 emojis aceitos, 9 emojis min_length)
- [ ] RULE_MESSAGES: textos exatos e objeto congelado

### utils/email.utils.js (novo)
- [ ] normalizeEmail: trim + minúsculas; não string -> ''
- [ ] isValidEmail: válido, válido depois de normalizar, formatos inválidos
- [ ] isValidEmail: limite de 254 (254 aceito, 255 recusado, 254 depois do trim aceito); não string recusado

### utils/datetime.utils.js (novo)
- [ ] should format the unlock time in America/Sao_Paulo (17:35Z -> 14:35)
- [ ] perto da meia-noite UTC (02:05Z -> 23:05), meia-noite local como 00:00, aceita timestamp

### utils/database-errors.utils.js (novo)
- [ ] KnexTimeoutError, cada código de conexão, fatal: true -> true
- [ ] entrada falsy, erro comum, código de erro SQL, fatal diferente de true -> false

### utils/app-error.utils.js (novo)
- [ ] AppError: Error, name, status, message, extra padrão {} e extra informado
- [ ] unauthorized 401, forbidden 403, serviceUnavailable 503
- [ ] accountLocked: 423, mensagem com a hora, extra.locked_until ISO
- [ ] MESSAGES: textos do §5 e objeto congelado

### config/env.js (alterado)
- [ ] corrigir should read the values from the environment (loginRateLimit)
- [ ] should reject a platform admin password shorter than 10 characters
- [ ] senha acima de 64 caracteres e acima de 72 bytes, com motivo e sem o valor
- [ ] e-mail inválido e acima de 254 caracteres, com motivo
- [ ] variável ausente: mensagem antiga, reason null (inclusive PLATFORM_ADMIN_*)
- [ ] LOGIN_RATE_LIMIT_MAX: rejeita 0, 10001, texto; aceita 1 e 10000; config.loginRateLimit padrão e lido

### middleware/cors.middleware.js (alterado)
- [ ] corrigir should allow the configured frontend origin (x-domain-id)
- [ ] preflight com X-Domain-Id

### middleware/error-handler.middleware.js (alterado)
- [ ] AppError 4xx: status, message + extra, sem log
- [ ] AppError 423 com locked_until no corpo
- [ ] AppError 5xx: loga com requestId
- [ ] should answer 503 when the database is unavailable (log com requestId)
- [ ] banco indisponível sem req.log usa o logger da app

### logger/index.js (alterado)
- [ ] REDACTED_PATHS
- [ ] should redact the Authorization header (saída sem o valor, com [redacted])
- [ ] cookie também redigido

## Etapa 2

Modo: autônomo (implement-feature). Checklist aprovado automaticamente.

Padrão de mock (regras PA1–PA3):
- `jest.mock('<rel>/database', () => ({ getDb: jest.fn() }))`;
- cada `getDb()` devolve uma nova função knex (`jest.fn(table => builder)`), e cada chamada dela um builder NOVO;
- builder: `select`, `where`, `whereNull`, `whereIn`, `leftJoin`, `join`, `orderBy`, `forUpdate`, `insert`,
  `update` com `mockReturnThis`; `first` com `mockResolvedValue(row)`; `then`/`catch` ligados a uma Promise real;
- `trx` é uma função knex própria (`jest.fn(table => builder)`), para provar que o handle de escrita/leitura não é usado;
- `uuid.utils` e `email.utils` reais (utilitários puros); `Date` fixado com `jest.useFakeTimers({ now })`;
- `randomUUID` real: as asserções só dependem do formato v4 e do binário inserido.

### 1. `src/models/session.model.js` → `__tests__/unit/models/session.model.test.js`
- [x] create: devolve UUID v4, insere `id` binário igual a `uuidToBin(id)`, handle `write`
- [x] create: dono plataforma → `platform_user_id` binário e `user_id` null
- [x] create: dono de domínio → `user_id` binário e `platform_user_id` null
- [x] create: user agent truncado em 255
- [x] create: `ip_address` e `user_agent` null quando ausentes
- [x] create: usa o `trx` e não chama `getDb`
- [x] create: rejeita id de dono inválido (TypeError) sem inserir
- [x] findWithIdentity: null quando não há linha
- [x] findWithIdentity: consulta (tabela `active_sessions as s`, 3 leftJoins, colunas, where `s.id` binário, `first`)
- [x] findWithIdentity: identidade da plataforma com `domain: null`
- [x] findWithIdentity: identidade de domínio com o objeto do domínio
- [x] findWithIdentity: identidade de domínio com `domain: null` quando `dr_domain_id` é null
- [x] revoke: where id binário, whereNull revoked_at, update com data e motivo; devolve a contagem
- [x] revoke: honra o `trx`
- [x] revokeAllForUser: filtro por usuário, não revogadas, não expiradas; devolve a contagem
- [x] revokeAllForUser: honra o `trx`
- [x] revokeAllForDomain: um UPDATE só, `whereIn('user_id', subconsulta)` em `users.dr_domain_id`, não revogadas, não
  expiradas; devolve a contagem
- [x] revokeAllForDomain: honra o `trx`

### 2. `src/models/platform-user.model.js` → `__tests__/unit/models/platform-user.model.test.js`
- [x] findByEmail: conta mapeada; colunas; handle `read`
- [x] findByEmail: null sem linha
- [x] findByEmail: honra o `trx`
- [x] findByEmailForUpdate: usa o `trx` e `.forUpdate()`, sem `getDb`
- [x] findByEmailForUpdate: null sem linha
- [x] existsAny: true / false; honra o `trx`
- [x] emailExists: true / false; honra o `trx`
- [x] create: devolve UUID v4, insere id binário, nome, e-mail, hash; handle `write`; honra o `trx`
- [x] registerFailure: contador, bloqueio, `updated_at`; honra o `trx`
- [x] registerSuccess: zera contador e bloqueio, `last_login_at` e `updated_at`; honra o `trx`

### 3. `src/api/v2/models/user.model.js` → `__tests__/unit/api/v2/models/user.model.test.js`
- [x] findByEmail: conta mapeada com `domainId`; null sem linha; honra o `trx`
- [x] findByEmailForUpdate: `trx` + `.forUpdate()`; null sem linha
- [x] emailExists: true / false; honra o `trx`
- [x] registerFailure / registerSuccess / resetFailures: colunas, datas, `trx`

### 4. `src/api/v2/models/domain.model.js` → `__tests__/unit/api/v2/models/domain.model.test.js`
- [x] findById: `{ id, name, status }`; where id binário; handle `read`
- [x] findById: null sem linha
- [x] findById: honra o `trx`

### 5. `src/api/v2/models/permission.model.js` → `__tests__/unit/api/v2/models/permission.model.test.js`
- [x] findByRole: join, select, where role, orderBy área/ação, mapeado para `area.action`
- [x] findByRole: lista vazia quando o papel não tem permissões

### 6. `src/services/email-availability.service.js` → `__tests__/unit/services/email-availability.service.test.js`
- [x] normaliza o e-mail e consulta os dois models com o `trx`
- [x] true quando só a plataforma tem o e-mail
- [x] true quando só um domínio tem o e-mail
- [x] true quando os dois têm
- [x] false quando nenhum tem
- [x] sem opções → `trx` undefined
- [x] propaga a falha do banco

### 7. `src/services/platform-admin-bootstrap.service.js` → `__tests__/unit/services/platform-admin-bootstrap.service.test.js`
- [x] já existe usuário da plataforma → log `Platform admin already present`, nada criado, `{ created: false }`
- [x] e-mail normalizado de usuário de domínio → erro com a mensagem do §5, nada criado, sem hash
- [x] cria com bcrypt custo 10, nome `Administrador da plataforma`, e-mail normalizado; log `Platform admin created`
  sem a senha; `{ created: true, id }`
- [x] `should create the platform admin once and leave it unchanged on the next start`
- [x] falha do hash → rejeita e não cria

## Etapa 3

Modo: autônomo (implement-feature). Só arquivos em `apps/backend/__tests__/unit/`. Nada de produção.

### 1. `src/services/auth.service.js` → `__tests__/unit/services/auth.service.test.js`
Mocks: bcrypt (hash, compare), database (getDb → { transaction(cb) → cb(trx) }), config (jwtSecret), models
(Domain, User, PlatformUser, Session). jwt real. Relógio: fake timers só do Date.
- [ ] e-mail inexistente: compare com o hash fixo, 401, sem registerFailure nem sessão
- [ ] `should answer 401 with the same body for unknown e-mail and wrong password`
- [ ] e-mail normalizado e procurado primeiro em platform_users (UserModel não consultado)
- [ ] fallback para users quando não há platform_user
- [ ] `should refuse the right password while the account is locked` (423, compare não chamado, nada gravado)
- [ ] bloqueio vencido (lockedUntil no passado ou igual a agora) segue para a comparação
- [ ] senha fora das regras (curta, > 72 bytes) comparada com o hash fixo, nunca com o da conta; contador +1
- [ ] senha errada: contador +1, lockedUntil null, 401 (it.each platform/domain → model certo)
- [ ] `should lock the account on the fifth consecutive failure` (423, lockedUntil = agora + 15 min, contador 0, extra)
- [ ] contador acima do teto também bloqueia
- [ ] erro devolvido pela transação: a transação resolve (commit) e o service lança
- [ ] `should refuse a user of an inactive or removed domain` (inactive, removed, ausente → 403, resetFailures, sem sessão)
- [ ] sucesso platform: registerSuccess, sessão com platformUserId, expires_at truncado + 8 h, JWT HS256 com
      `{ data: { session_id, user } }` e exp, sem dr_domain_id, resultado com expires_at ISO
- [ ] sucesso domain: sessão com userId, dr_domain_id no token
- [ ] `should reset the counter on a successful login`
- [ ] erro de banco na transação propaga
- [ ] hash fixo calculado uma vez (módulo isolado)
- [ ] logout revoga com o motivo `logout`

### 2. `src/middleware/authentication.middleware.js` → `__tests__/unit/middleware/authentication.middleware.test.js`
Mocks: config (jwtSecret), SessionModel.findWithIdentity, PermissionModel.findByRole. jwt e uuid reais.
- [ ] header ausente / malformado (Basic, Bearer sem token, Bearer com espaço) → 401 sem consulta
- [ ] assinatura errada, algoritmo diferente de HS256, token expirado → 401
- [ ] payload sem session_id, com id não UUID, sem user → 401
- [ ] sessão null, revogada, expirada (inclusive igual a agora) → 401
- [ ] outra identidade (tipo, id), domínio inativo, domínio ausente, outro domínio → 401
- [ ] platform: contexto completo (tabela do §5)
- [ ] domain: contexto completo, domainInBinary Buffer, permissions Set
- [ ] `should answer 503 when the database is unavailable` (erro original repassado ao next), também na consulta de permissões

### 3. `src/middleware/authorization.middleware.js` → `__tests__/unit/middleware/authorization.middleware.test.js`
Mock: DomainModel.findById.
- [ ] sem a permissão (ou sem req.permissions) → 403
- [ ] `should ignore X-Domain-Id for domain users`
- [ ] `should require X-Domain-Id for the platform admin on a shared route` (400 e depois passa)
- [ ] X-Domain-Id não UUID → 404 sem consulta; desconhecido ou removido → 404
- [ ] ativo e inativo passam e preenchem domainId/domainInBinary
- [ ] erro do model → next(error)
- [ ] requirePlatformAdmin: platform passa, domain → 403

### 4. `src/middleware/login-rate-limit.middleware.js` → `__tests__/unit/middleware/login-rate-limit.middleware.test.js`
Mocks: express-rate-limit (rateLimit captura opções e devolve um limiter jest.fn), rate-limit-redis (RedisStore
fake), redis-client (getClient), config (loginRateLimit).
- [ ] opções do rateLimit (janela, teto, headers, store LazyRedisStore com getClient)
- [ ] handler responde 429 com a mensagem
- [ ] store criado uma vez, prefixo `rl:auth:`, sendCommand repassa o array
- [ ] init guarda as opções e repassa ao store
- [ ] decrement e resetKey repassados
- [ ] connect rejeitado / script rejeitado não deixam store; a próxima chamada tenta de novo
- [ ] getScriptSha rejeitado é engolido
- [ ] `should answer 503 when the rate limit store fails`
- [ ] sucesso chama next() sem argumento

### 5. `src/api/v2/controllers/auth.controller.js` → `__tests__/unit/api/v2/controllers/auth.controller.test.js`
Mock: auth.service. Joi real.
- [ ] corpos inválidos (ausente, sem campos, tipos errados, vazios, só espaços, e-mail > 254) → 400, service não chamado
- [ ] corpo válido: e-mail com trim, senha, req.ip, user-agent; e-mail de 254 aceito
- [ ] sucesso: Cache-Control no-store, 200, corpo do service
- [ ] erro do service → next(error)
- [ ] logout: service com req.sessionId, 204 end; erro → next

### 6. `src/api/v2/controllers/me.controller.js` → `__tests__/unit/api/v2/controllers/me.controller.test.js`
- [ ] 200 com currentUser e permissões ordenadas (platform e domain)

### 7. `__tests__/unit/utils/uuid.utils.test.js` (M)
- [ ] isUuid: true para 8-4-4-4-12 (minúsculas e maiúsculas); false para 32 hex, chaves, não string, malformado

### 8. `__tests__/unit/app.test.js` (M)
Mocks: login-rate-limit (next), auth.service.
- [ ] `/v2` desconhecido sem token → 401 com a mensagem de sessão expirada
- [ ] `POST /v2/auth/login` malformado chega ao controller (400), passando pelo limite
- [ ] teste de x-request-id usa uma rota desconhecida fora do `/v2` para continuar sendo um 404

### Resultado
Todos os itens acima implementados e passando (marcar todos como [x]).
- auth.service: 26 testes, 100/100/100/100
- authentication.middleware: 31 testes, 100%
- authorization.middleware: 17 testes, 100%
- login-rate-limit.middleware: 13 testes, 100%
- auth.controller: 18 testes, 100%; me.controller: 4 testes, 100%
- uuid.utils: 35 testes (17 novos de isUuid), 100%
- app.test: 5 testes (2 novos), index.js/auth.routes/me.routes 100%
- Suíte unitária inteira: 28 suítes, 382 testes, todos passando; maior teste novo 26 ms (app.test 89 ms no
  aquecimento do supertest, teste preexistente)
- Prettier e ESLint (--max-warnings 0) limpos nos 8 arquivos

## Etapa 4

Modo: autônomo (implement-feature). Regras: as da skill `unit-test-writer` para este layout.
Serviços instanciados à mão (`httpClientMock` com um `jest.fn()` por método), `localStorage` mockado antes dos
imports, componentes reais no TestBed com `NO_ERRORS_SCHEMA` e serviços mockados, guards e interceptores em
`TestBed.runInInjectionContext` com os serviços como `useValue`. Textos de produto em português são comparados
literalmente (constantes no topo do spec, como nos testes do backend); todo o resto em inglês.

Dependências comuns: `HttpClient` (mock), `Router` (mock ou `provideRouter([])` quando há `RouterLink`/`RouterOutlet`),
`MatSnackBar` (mock), `ActivatedRoute` (mock), `Document` (fake com `body` e `defaultView`), `window.history.state`
(jsdom `replaceState`), `Date.now` (spy).

### Lote 1 — serviços

### `auth/sign-in/sign-in.service.ts`
- [x] login: POST `${apiUrl}/auth/login` com `{ email, password }`
- [x] login: grava só `{ token, expires_at }` em `currentUser` e emite a sessão
- [x] login com erro: nada gravado, erro propagado
- [x] logout: POST `${apiUrl}/auth/logout` com `{}`, apaga a sessão, emite `undefined` e completa
- [x] logout com 401, 503 e status 0: apaga a sessão, emite `undefined`, completa sem erro
- [x] getSession: sessão válida; sem chave; JSON inválido; sem token; `null` gravado
- [x] getToken: token presente / ausente
- [x] isSessionExpired: sem sessão; data inválida; passado; igual a agora; futuro
- [x] clearSession: remove `currentUser`

### `services/current-user.service.ts`
- [x] me$ começa `null`
- [x] load: GET `${apiUrl}/me`, emite e guarda o `me`, me$ emite
- [x] ensureLoaded: com `me` guardado devolve sem HTTP
- [x] ensureLoaded: chamadas simultâneas compartilham um GET
- [x] ensureLoaded: depois de um erro, nova chamada refaz o GET
- [x] landingRoute por papel (3), sem argumento usa o guardado, sem usuário `/login`, `null` explícito `/login`
- [x] clear: me$ volta a `null`

### `services/notification.service.ts`
- [x] showUnavailable abre o snackbar com a mensagem, `Fechar` e 6000 ms

### `services/auth-navigation.service.ts`
- [x] sessionExpired: limpa sessão e usuário, navega para `/login` com a mensagem
- [x] duas chamadas simultâneas: uma limpeza e uma navegação
- [x] depois da navegação resolvida, novo redirecionamento permitido
- [x] forbidden e notFound com `skipLocationChange`

### `shared/services/theme.service.ts`
- [x] `dark` gravado vence o SO; `light` gravado vence o SO escuro
- [x] sem valor gravado segue `prefers-color-scheme` (escuro e claro); valor inválido segue o SO
- [x] sem `matchMedia` → claro; sem `defaultView` → claro
- [x] classes do `<body>` aplicadas na criação
- [x] toggle: troca classes, grava `theme`, emite em `isDarkMode$`; segundo toggle volta

### Lote 2 — interceptores e guards

### `interceptors/auth.interceptor.ts`
- [x] API com token → Bearer
- [x] API sem token → requisição original
- [x] fora da API → requisição original, sem ler token

### `interceptors/error.interceptor.ts`
- [x] fora da API, `/auth/login` e `/auth/logout` passam intactos (erro repassado, nenhum tratamento)
- [x] caminho parecido com o ignorado (`/auth/logout-all`) é tratado
- [x] resposta de sucesso passa intacta
- [x] 401 → sessionExpired; 403 → load e depois forbidden (também com erro no load); 404 → notFound
- [x] 503 e 0 → showUnavailable sem sessionExpired; 500 só repassa
- [x] o erro original é sempre repassado

### `guards/auth.guard.ts`
- [x] authGuard: sem token → `/login`; vencida → limpa e RedirectCommand com a mensagem; carregado → true;
      503/0 → `/unavailable` com sessão mantida; 401/500 → false
- [x] loginGuard: sem token → true; vencida → true; válida → destino; erro → true
- [x] landingGuard: destino; erro → false
- [x] permissionGuard: permitido → true; negado → RedirectCommand `/forbidden` com `skipLocationChange`; erro → false
- [x] platformAdminGuard: platform_admin → true; outro papel → RedirectCommand; erro → false

### Lote 3 — componentes do login

### `auth/sign-in/sign-in.component.ts`
- [x] renderiza título, subtítulo, campos e Entrar
- [x] botão desabilitado com campos vazios, com um só campo e durante o envio; habilitado com os dois
- [x] submit inválido ignorado; submit durante envio ignorado
- [x] sucesso: login, load, destino do papel (3 papéis), `submitting` volta a false
- [x] erro do backend 401/403/423/429/503 mostra a `message` do corpo no card
- [x] status 0 → indisponibilidade (mesmo com corpo); corpo sem `message` → indisponibilidade; erro no `/v2/me`
- [x] mensagem da navegação (Sair, sessão expirada), estado não string, sem estado; limpa no submit
- [x] erro anterior limpo no novo submit
- [x] olho da senha: tipo, ícone e aria-label alternam

### `auth/auth.component.ts`
- [x] card com `router-outlet`

### `auth/unavailable/unavailable.component.ts`
- [x] mensagem no `role="alert"`; "Tentar novamente" navega para `/`

### Lote 4 — shell e páginas

### `layout/layout.component.ts`
- [x] cabeçalho, menu e `router-outlet` no `main`

### `main-header/main-header.component.ts`
- [x] marca; sem usuário sem identidade
- [x] nome, rótulo do papel e domínio/Plataforma por papel; atualização do me$
- [x] ícone de tema por estado; clique chama `toggle`
- [x] Sair: logout, clear, navigate com a mensagem; nada antes do logout terminar

### `main-sidebar/menu-items.ts` e `main-sidebar/main-sidebar.component.ts`
- [x] visibleItems por papel e `null`; permissão ausente não mostra item
- [x] links renderizados com rótulo, ícone e href por papel; `null` sem itens; atualização do me$

### `breadcrumbs/breadcrumbs.component.ts`
- [x] vazio por padrão; cada crumb com ícone, alias e href; separadores entre itens

### `placeholder/placeholder.component.ts`
- [x] título e breadcrumbs da rota; aviso "Esta tela chega numa próxima versão."; nova emissão atualiza

### `forbidden/forbidden.component.ts` e `not-found/not-found.component.ts`
- [x] títulos e mensagens

### `app.component.spec.ts` (atualização)
- [x] ThemeService mockado; cria; `router-outlet`; expõe o tema

### Lacunas conhecidas
- A spec §7 cita `hasPermission` no `CurrentUserService`, mas o código não tem esse método (a checagem está nos
  guards e no `menu-items.ts`). Não há o que testar; fica como observação.
- `menu-items.ts` linha 32: o ramo `item.permission ?? ''` não é alcançável pela API pública (todo item sem
  `platformOnly` tem permissão no `MENU_ITEMS` privado). Ramos em 85,71%, acima do mínimo.

### Resultado
- 20 suítes, 172 testes, todos verdes; nenhum teste acima de 100 ms; nenhum ruído no console.
- Cobertura: 100% em linhas, funções e statements em todos os fontes; ramos 100%, exceto `menu-items.ts` (85,71%).
- Prettier, ESLint (`--max-warnings 0`) e `tsc --noEmit -p tsconfig.gate.json` limpos.

