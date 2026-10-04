# Contract — F04 Autenticação do sistema

> Contrato operacional desta feature, gerado pelo `spec-writer` a partir do PRD e da spec.
> O `implement-feature` precisa cumpri-lo, e o `evaluator` valida contra ele.

## Environment Contract

Sem isto, a avaliação não começa (ambiente inválido ≠ implementação errada).

- **Docker Desktop rodando** (`docker info` responde), com as portas `127.0.0.1:3306`, `:6379`, `:4200`, `:3030` e
  `:3131` livres para o ambiente do projeto.
- **Node 22** e `npm ci` feito no `apps/backend`, no `apps/frontend` (com o `.npmrc`) e na raiz.
- **Navegador do Playwright:** o Chromium instalado para o `@playwright/test` da raiz (`npx playwright install
  chromium`), e o `playwright-cli` para as verificações com o navegador visível.
- **Arquivos locais, nenhum deles versionado:**
  - `.env.infra`, `apps/backend/.env.development` e `apps/backend/.env.testing`;
  - o `apps/backend/.env.development` com `LOGIN_RATE_LIMIT_MAX=200`;
  - as variáveis `E2E_*` do harness, onde a `gate-builder` documentar no `GATES.md`.
- **Gate de integração do backend (`tests-integration-backend`):** o `./dev.sh --infra`, com o MySQL e o Redis
  `healthy`.
- **Para os gates de navegador e os critérios de runtime:**
  - `./dev.sh` executado, com os seis serviços `healthy`, as migrations e o seed aplicados;
  - os containers do backend e do frontend reiniciados depois da mudança dos lockfiles
    (`docker compose -p ai-gateway-app restart backend frontend`), para que o entrypoint rode o `npm ci`.
- **Ordem depois da spec** (spec §3):
  1. a rodada prévia da `gate-builder`;
  2. o `implement-feature`;
  3. a rodada posterior da `gate-builder`;
  4. a `e2e-test-writer` para as linhas `e2e`;
  5. o `evaluator`.

  Sem a rodada posterior, o `e2e-frontend` e o `visual-frontend` não contam como provados.
- **Verificações que param a infraestrutura** (critérios 14 e 15):
  - parar com `docker compose -p ai-gateway-infra stop mysql` (ou `redis`) e religar com `start`;
  - esperar o `healthy` antes de seguir;
  - nunca remover volumes.
- **Verificações de login no navegador** (`runtime-only`): cada login gasta uma tentativa do IP, dentro do teto de
  desenvolvimento (200). Nenhuma verificação envia uma senha errada para uma conta existente: a mensagem de credencial
  inválida é conferida com um e-mail inexistente.
- **Senhas:** a senha das contas e2e fica no `PLATFORM_ADMIN_PASSWORD` do `apps/backend/.env.development`. Leia o valor
  sem imprimi-lo, por exemplo gravando-o num arquivo do scratchpad usado como padrão do `grep -F -f`, e apague o arquivo
  depois.
- **Smoke de UI:** sempre no tema escuro primeiro e depois no claro, sem deixar a tela no tema claro no fim
  (`CLAUDE.md`).

## Quality Gates

Rodados da raiz, com `npm run gate:<id>`. As regras de cada um estão no `GATES.md`. A cadeia padrão (`npm run gate`)
precisa passar inteira. A F04 muda o `package.json` e o lockfile do backend e do frontend, então o lint e os testes
desses dois apps rodam no app inteiro, com o limite global de 80%.

- [ ] `typecheck-frontend` — `tsc --noEmit -p apps/frontend/tsconfig.gate.json` (código e specs).
- [ ] `lint-backend` — ESLint com zero warnings no backend inteiro.
- [ ] `raw-sql-backend` — nenhum SQL raw novo em `apps/backend/src`. As migrations e o seed ficam fora do `src/`.
- [ ] `query-loop-backend` — nenhuma consulta dentro de loop. O `revokeAllForDomain` é um `UPDATE` só, com subconsulta.
- [ ] `lint-frontend` — ESLint com zero warnings no `apps/frontend/src` inteiro, inclusive as regras de template do
  design system.
- [ ] `styles-frontend` — stylelint nos `.css` novos, regras de template e nenhum `.component.scss`.
- [ ] `build-backend` — `npm run build` (Babel).
- [ ] `build-frontend` — `ng build` de produção. É optIn, mas **obrigatório nesta feature**, porque a F04 cria templates
  que o `typecheck-frontend` não lê. Roda com `npm run gate:build-frontend`.
- [ ] `arch` — dependency-cruiser + `check-architecture`:
  - as rotas só ligam URL → middleware → controller;
  - os models não importam controllers, rotas nem o Express;
  - o `process.env` só em `index`, `loader` e `src/config/**` (o seed e os middlewares leem o `config`);
  - o `.listen(` só no `index.js`.
- [ ] `tests-backend` — a suíte unitária inteira do backend, com cobertura ≥ 80%, e a conferência dos contratos Pact,
  que não mudam.
- [ ] `tests-frontend` — a suíte inteira do frontend, com cobertura ≥ 80%.
- [ ] `tests-integration-backend` — `migrations:test` e `__tests__/integration` contra o `web_test` e o Redis de teste.
  Precisa do `./dev.sh --infra`.
- [ ] `deadcode` — knip no backend e no frontend: nenhum export sem uso e nenhuma dependência sem uso. Uma exceção de
  fonte, se houver, fica no `knip.json` e no `GATES.md`.
- [ ] `visual-frontend` — **gate novo**, montado pela `gate-builder` na rodada prévia e provado na posterior. Mede os
  valores renderizados da tabela "Test-suite hint".
- [ ] `e2e-frontend` — provado verde nos três perfis (`platform_admin`, `admin`, `user`) na rodada posterior da
  `gate-builder`, com os testes das linhas `e2e` escritos depois pela `e2e-test-writer`. A partir daí, entra na cadeia
  padrão.

Não se aplicam (dão `PASS (nothing to check)`): `typecheck-monorepo`, `lint-monorepo`, `build-monorepo`,
`tests-monorepo`, `tests-integration-ia` e `tests-integration-ia_simulator`.

**Allowlist de acesso a dados:** a F04 não deve precisar de entradas. Uma entrada nova sem `approved` impede o estado
CLEAN (`GATES.md`).

## Coverage Manifest

- `Auth-01` (HTTP · `POST /v2/auth/login`) → corpo, identidades, mensagens, bloqueio, domínio inativo, limite por IP,
  indisponibilidade, sessão e token.
- `Session-01` (HTTP · autenticação, `POST /v2/auth/logout`, `GET /v2/me`) → os casos de 401, o logout, o corpo do
  `/v2/me`, a permissão lida a cada requisição, o domínio que deixa de estar ativo, o 503 do MySQL e o crescimento de
  consultas.
- `Authz-01` (middlewares · `checkPermission`, `requirePlatformAdmin`, `X-Domain-Id`) → o 403, o domínio do
  `platform_admin` e a rota exclusiva da plataforma.
- `Boot-01` (partida do backend) → o primeiro administrador, as regras da senha e do e-mail, a idempotência e o e-mail em
  conflito.
- `Data-01` (MySQL, Redis e logs) → as tabelas, o catálogo 400/401, o seed, o hash bcrypt, o e-mail único entre as
  identidades e a ausência da senha nos logs.
- `UI-01` (UI · login e sessão) → o formulário, o destino por papel, as mensagens de erro, Sair e a sessão expirada.
- `UI-02` (UI · shell) → o cabeçalho, o menu por permissão, os breadcrumbs e o tema claro e escuro.
- `UI-03` (UI · rotas protegidas) → as telas provisórias, o acesso negado, a página não encontrada e a recarga do
  `/v2/me` depois de um 403.
- `UI-04` (UI · indisponibilidade) → o MySQL e o Redis parados, com o app aberto e ao abrir o app.
- `Docs-01` (documentação, modelos e `./dev.sh`) → a cópia do design system, o README, o `GATES.md`, os modelos `.env` e
  o seed no `./dev.sh`.

## Surfaces & Behaviors

### Surface: `Auth-01` — `POST /v2/auth/login`
- **Estado inicial:** `./dev.sh` no ar, com o seed. Nos testes, o `web_test` com os dados do `setupTestDatabase` e a
  chave `rl:auth:*` limpa.
- **Comportamentos:**
  - [ ] As credenciais certas de cada identidade devolvem 200 com `token` e `expires_at` = login + 8 h (truncado ao
    segundo), e uma linha nova em `active_sessions`.
  - [ ] O e-mail é comparado sem diferenciar maiúsculas e sem os espaços das pontas.
  - [ ] Um e-mail inexistente e uma senha errada devolvem o mesmo 401 com *"E-mail ou senha inválidos."*
  - [ ] Uma senha acima de 72 bytes (até 64 caracteres) devolve 401, soma ao contador e nunca é comparada com o hash da
    conta.
  - [ ] A 5ª senha errada seguida devolve 423 com a mensagem do bloqueio e o `HH:MM` em `America/Sao_Paulo`. A 6ª
    tentativa, com a senha certa, também devolve 423.
  - [ ] Depois do `locked_until`, a senha certa entra, e o contador volta a 0.
  - [ ] A senha certa de um usuário de domínio inativo ou removido devolve 403 com a mensagem do PRD, sem sessão.
  - [ ] Um corpo sem e-mail ou sem senha devolve 400 *"Informe o e-mail e a senha."*
  - [ ] Com o teto 20, a 21ª tentativa do mesmo IP na janela devolve 429 com `Retry-After`.
  - [ ] Com o Redis fora, o login devolve 503 em até 2 s.
  - [ ] A resposta tem `Cache-Control: no-store`, e o JWT traz `{ data: { session_id, user } }` com o `exp` igual ao
    `expires_at` em segundos.

### Surface: `Session-01` — autenticação, logout e `/v2/me`
- **Estado inicial:** uma sessão válida de cada papel.
- **Comportamentos:**
  - [ ] Sem token, com um token adulterado, com uma sessão revogada ou com uma sessão vencida (o `expires_at` ou o `exp`
    no passado), a resposta é 401 *"Sua sessão expirou. Entre novamente."*
  - [ ] O logout devolve 204, e o mesmo token recebe 401 na requisição seguinte.
  - [ ] O `/v2/me` devolve o corpo da spec §5 para os três papéis, com as permissões do papel.
  - [ ] Uma troca de papel feita no banco aparece no `/v2/me` da requisição seguinte.
  - [ ] Depois que o domínio de um usuário logado passa a `inactive` na cópia, a requisição seguinte recebe 401.
  - [ ] Com o MySQL fora, uma requisição autenticada recebe 503, nunca 401, e o log tem o request ID.
  - [ ] O número de consultas do `/v2/me` não cresce com o número de permissões do papel.

### Surface: `Authz-01` — middlewares de autorização
- **Estado inicial:** rotas montadas só no teste de integração, com `checkPermission('users', 'read')` e
  `requirePlatformAdmin`.
- **Comportamentos:**
  - [ ] O `user` recebe 403 *"Você não tem permissão para acessar esta página."* na rota com `users.read`, e o
    `domain_admin` passa.
  - [ ] O `platform_admin` sem `X-Domain-Id` recebe 400. Com um id inválido, inexistente ou removido, recebe 404. Com um
    domínio ativo ou inativo da cópia, passa, e o `req.domainId` é o do header.
  - [ ] Num usuário de domínio, o `X-Domain-Id` é ignorado, e vale o domínio da sessão.
  - [ ] O `domain_admin` recebe 403 na rota com `requirePlatformAdmin`, e o `platform_admin` passa.
  - [ ] O CORS aceita o header `X-Domain-Id` vindo da origem do frontend.

### Surface: `Boot-01` — partida do backend
- **Estado inicial:** `platform_users` vazia (teste de integração, ou a primeira partida depois das migrations).
- **Comportamentos:**
  - [ ] A primeira partida cria um `platform_admin` com o `PLATFORM_ADMIN_EMAIL` normalizado e o hash da senha, e o log
    diz `Platform admin created`.
  - [ ] Uma segunda partida não cria nem altera nenhuma linha (`updated_at` e `password_hash` iguais), e o log diz
    `Platform admin already present`.
  - [ ] Com uma senha fora das regras, o backend sai com código 1, e o log cita a variável e a regra, sem o valor.
  - [ ] Com o `PLATFORM_ADMIN_EMAIL` já usado por um usuário de domínio, o backend sai com código 1 e a mensagem da spec.

### Surface: `Data-01` — banco, Redis e logs
- **Estado inicial:** migrations e seed aplicados no `web`.
- **Comportamentos:**
  - [ ] As seis tabelas da spec §6 existem, com as colunas UUID em `BINARY(16)` e os nomes de FK, UNIQUE, CHECK e
    índice da spec.
  - [ ] `permissions` tem 400 `users/read` e 401 `playground/read`, e `role_permissions` tem o mapa da spec.
  - [ ] O seed criou os dois domínios e as três contas, e uma segunda execução não muda nada.
  - [ ] Todo `password_hash` começa com `$2b$10$`.
  - [ ] Um e-mail de uma identidade é reconhecido como ocupado pela outra (`isEmailTaken`), nos dois sentidos.
  - [ ] Depois de logins certos e errados, a senha não aparece em nenhuma linha dos logs do backend.

### Surface: `UI-01` — login e sessão
- **Estado inicial:** no e2e, a sessão guardada do perfil. Na verificação no navegador, um navegador sem `currentUser`,
  em `http://127.0.0.1:4200/login`.
- **Comportamentos:**
  - [ ] A tela mostra "AI Gateway", os campos E-mail e Senha e o botão Entrar, desabilitado enquanto falta um campo.
  - [ ] O login de cada conta leva ao destino do papel: `platform_admin` → `/domains`, `admin` → `/users`, `user` →
    `/playground`.
  - [ ] Com a sessão guardada, abrir `/` ou `/login` leva ao destino do papel.
  - [ ] Um e-mail inexistente mostra *"E-mail ou senha inválidos."* dentro do card.
  - [ ] A conta `inativo@temporario.com`, com a senha certa, mostra a mensagem do domínio desativado.
  - [ ] Sair leva ao login com *"Você saiu do sistema."*, e o token antigo recebe 401. Se o logout falhar (401, 503 ou
    rede), a sessão local é apagada do mesmo jeito.
  - [ ] Com um token adulterado ou vencido no `currentUser`, a navegação leva ao login com *"Sua sessão expirou. Entre
    novamente."*, e o `currentUser` é apagado.
  - [ ] As mensagens de bloqueio (423), de limite (429) e de indisponibilidade (503) aparecem no card com o texto do
    backend. Uma falha de rede no login (status 0) mostra a mensagem de indisponibilidade no card.

### Surface: `UI-02` — shell
- **Estado inicial:** a sessão guardada do perfil, numa tela provisória.
- **Comportamentos:**
  - [ ] O cabeçalho mostra o nome, o rótulo do papel e o domínio ("Plataforma" para o `platform_admin`), a troca de tema
    e Sair.
  - [ ] O menu mostra Domínios e Usuários ao `platform_admin`, Usuários e Playground ao `admin`, e só Playground ao
    `user`.
  - [ ] Clicar num item do menu leva à rota dele, que fica destacada, com o título, o breadcrumb e o aviso da tela
    provisória.
  - [ ] O ícone de tema alterna `theme-default`/`theme-default-dark` no `<body>`, e a escolha persiste depois de
    recarregar.
  - [ ] As medidas da tabela "Test-suite hint" (`visual-frontend`) conferem nos dois temas.

### Surface: `UI-03` — rotas protegidas
- **Estado inicial:** a sessão guardada do perfil.
- **Comportamentos:**
  - [ ] O `user` que abre `/users` ou `/domains` pela URL vê *"Você não tem permissão para acessar esta página."*, com a
    URL pedida na barra e o shell visível, e o menu dele não tem Usuários nem Domínios.
  - [ ] Uma URL inexistente mostra *"Página não encontrada."* dentro do shell.
  - [ ] Um 403 de uma chamada à API recarrega o `/v2/me` e atualiza o menu antes de mostrar o acesso negado. Um 404 de
    uma chamada à API mostra a página não encontrada.

### Surface: `UI-04` — indisponibilidade
- **Estado inicial:** sessão do `admin` numa tela do shell. MySQL ou Redis parado durante a verificação.
- **Comportamentos:**
  - [ ] Com o MySQL parado, recarregar a página abre `/unavailable` com *"Serviço temporariamente indisponível. Tente
    novamente em instantes."*, sem levar ao login, e o `currentUser` continua lá. Religado o MySQL, "Tentar novamente"
    volta ao destino do papel sem novo login.
  - [ ] Um 503 ou uma falha de rede numa chamada feita com o app aberto mostra a mesma mensagem num snackbar, sem
    deslogar. Na F04, nenhuma tela chama a API depois de carregar, então isso é provado pelo teste unitário do
    `errorInterceptor`. A primeira tela que chamar a API (F07) o prova no navegador.
  - [ ] Com o Redis parado, o login mostra a mensagem de indisponibilidade, e o usuário já logado navega e recebe o
    `/v2/me` sem 401 nem 503.

### Surface: `Docs-01` — documentação, modelos e `./dev.sh`
- **Estado inicial:** a árvore da feature.
- **Comportamentos:**
  - [ ] O `docs/design-system/angular-material.md` existe e segue as regras de manter, trocar e tirar da spec §5. A
    conferência item a item de `docs/private/f04-design-system-checklist.md` passa, quando o arquivo existir na máquina.
  - [ ] As buscas da regra de confidencialidade (no handoff privado) não acham na cópia o nome do sistema de origem nem
    o caminho da pasta da skill. Antes do push, as linhas adicionadas no histórico também não.
  - [ ] O `GATES.md` aponta o `styles-frontend` para a cópia e documenta o `LOGIN_RATE_LIMIT_MAX` e a política de dados
    da F04.
  - [ ] O `README.md` tem a seção de autenticação.
  - [ ] Os três modelos `.env.*.example` do backend têm o `LOGIN_RATE_LIMIT_MAX`.
  - [ ] O `./dev.sh` aplica o seed depois das migrations.

## Observable Criteria

Rastreio para os critérios de aceite da F04 no PRD (§9) e para as regras da §6:

- [ ] `OC-01` — Na primeira inicialização, o `platform_admin` é criado com o `PLATFORM_ADMIN_EMAIL` e o
  `PLATFORM_ADMIN_PASSWORD`. Numa segunda, nada é criado ou alterado (PRD AC 1).
  - Evidência: o `Boot-01` no `./dev.sh` (a linha em `platform_users` e o log das duas partidas).
  - Evidência: o teste `should create the platform admin once and leave it unchanged on the next start`.
- [ ] `OC-02` — O backend não sobe com o `PLATFORM_ADMIN_PASSWORD` fora das regras, e o log diz qual regra falhou (PRD
  AC 2).
  - Evidência no runtime: `docker compose -p ai-gateway-app run --rm --no-deps -e PLATFORM_ADMIN_PASSWORD=curta
    backend npx babel-node index.js` sai com código 1 e cita `must have at least 10 characters`. Use uma senha ASCII:
    o Git Bash corrompe os acentos de um argumento.
  - Evidência: os testes de `env.test.js` com as três regras.
- [ ] `OC-03` — Uma senha de até 64 caracteres que passa de 72 bytes em UTF-8 é recusada (PRD AC 3). Evidência: o teste
  `should reject a password of 64 characters or less over 72 bytes` (config e `validatePassword`) e o teste de
  integração `should refuse a password over 72 bytes at login as a wrong password`.
- [ ] `OC-04` — Um usuário de um domínio desativado ou removido que acerta a senha vê *"O domínio da sua conta está
  desativado. Fale com o administrador da plataforma."* (PRD AC 4).
  - Evidência: o teste de integração com os status `inactive` e `removed`.
  - Evidência: o teste unitário do `SignInComponent` com o 403.
  - Evidência: o login de `inativo@temporario.com` no navegador (`UI-01`).
- [ ] `OC-05` — O `GET /v2/me` devolve o nome, o papel, o domínio e as permissões do usuário logado, e o menu reflete uma
  mudança de papel depois do primeiro 403 (PRD AC 5).
  - Evidência: o `Session-01` e os testes `should return name, role, domain and permissions` e
    `should reflect a role change on the next request`.
  - Evidência: o teste unitário do `errorInterceptor` (o 403 recarrega o `/v2/me` e o menu muda).
  - A troca de papel pela tela chega com a F09.
- [ ] `OC-06` — O login correto leva o `platform_admin` para Domínios, o `domain_admin` para Usuários e o `user` para o
  Playground (PRD AC 6).
  - Evidência: os testes e2e do destino por papel (a sessão guardada em `/` e em `/login`).
  - Evidência: o teste unitário do `SignInComponent` (destino depois do login).
  - Evidência: o login de cada conta no navegador (`UI-01`).
- [ ] `OC-07` — Senha errada e e-mail inexistente mostram a mesma mensagem, *"E-mail ou senha inválidos."* (PRD AC 7).
  - Evidência: o teste de integração com os dois corpos iguais.
  - Evidência: o teste unitário do `SignInComponent` com o 401.
  - Evidência: o e-mail inexistente no navegador (`UI-01`).
- [ ] `OC-08` — A 5ª tentativa errada seguida bloqueia a conta por 15 minutos, inclusive para a senha correta (PRD AC
  8). Evidência: os testes de integração `should lock on the fifth consecutive failure even for the right password` e
  `should let the user in after the lock expires`, e o teste unitário da hora em `America/Sao_Paulo`.
- [ ] `OC-09` — Uma sessão com mais de 8 horas é recusada e leva ao login com *"Sua sessão expirou. Entre novamente."*
  (PRD AC 9).
  - Evidência: o teste de integração `should refuse a session older than 8 hours`.
  - Evidência: os testes do `authGuard` (o `expires_at` vencido) e do `errorInterceptor` (o 401).
  - Evidência: o token adulterado no navegador (`UI-01`).
- [ ] `OC-10` — Uma requisição ao backend sem token, com token adulterado ou com a sessão revogada recebe 401 (PRD AC
  10). Evidência: o `Session-01` e o teste `should answer 401 without a token, with a tampered token and with a revoked
  session`.
- [ ] `OC-11` — Depois de Sair, o mesmo token recebe 401 na requisição seguinte, e a tela mostra *"Você saiu do
  sistema."* (PRD AC 11 e §6, Experiência).
  - Evidência: o teste de integração `should revoke the session on logout`.
  - Evidência: os testes unitários do `SignInService` (o logout) e do `SignInComponent` (a mensagem).
  - Evidência: Sair no navegador, com o token antigo recebendo 401 (`UI-01`).
- [ ] `OC-12` — A 21ª tentativa de login do mesmo IP em 15 minutos recebe 429 (PRD AC 12).
  - Evidência: o teste de integração `should answer 429 on the 21st attempt from the same IP`, com o teto padrão.
  - Evidência opcional no runtime: o backend recriado sem o `LOGIN_RATE_LIMIT_MAX` e religado com o valor de volta
    depois.
- [ ] `OC-13` — Um `user` que acessa uma rota de administração recebe 403, o menu dele não mostra as telas de
  administração, e a tela aberta pela URL mostra *"Você não tem permissão para acessar esta página."* (PRD AC 13).
  - Evidência: o `Authz-01` (o 403 numa rota montada no teste, por decisão do usuário).
  - Evidência: o teste e2e do acesso negado pela URL, que também confere o menu do `user`.
  - O 403 numa rota real do produto chega com a F09.
- [ ] `OC-14` — Com o MySQL parado, a requisição de um usuário logado recebe 503, e o frontend mostra *"Serviço
  temporariamente indisponível. Tente novamente em instantes."* sem levá-lo ao login (PRD AC 14).
  - Evidência: o `UI-04` no navegador, recarregando a página com o MySQL parado (`/unavailable`, sessão mantida).
  - Evidência: os testes unitários da autenticação (503, nunca 401), do `authGuard` e do `errorInterceptor` (snackbar
    sem deslogar). Nenhuma tela da F04 chama a API depois de carregar; o snackbar no navegador fica com a F07.
- [ ] `OC-15` — Com o Redis parado, o login recebe 503, e as requisições de um usuário já logado não recebem 401 nem 503
  por causa da sessão (PRD AC 15).
  - Evidência: o `UI-04` e os testes unitários do limite por IP.
  - A segunda parte do critério (as telas que dependem do proxy mostram a mensagem da F11) fica com a F11: nenhuma tela
    da F04 fala com o proxy.
- [ ] `OC-16` — Um e-mail que já existe como administrador da plataforma não pode ser usado por um usuário de domínio, e
  vice-versa (PRD AC 16). Evidência: o teste `should report an e-mail taken in either identity`, o
  `should refuse a platform admin e-mail already used by a domain user` e a falha do seed num e-mail em conflito. As
  telas que criam usuários (F07, F09) usam o `isEmailTaken`.
- [ ] `OC-17` — A senha é guardada com bcrypt e nunca aparece em logs (PRD AC 17).
  - Evidência: o `Data-01`, com o `password_hash` começando com `$2b$10$` e o `grep -c -F -f` com a senha nos logs do
    backend dando 0.
  - Evidência: os testes `should store the password as a bcrypt hash of cost 10` e `should redact the Authorization
    header`.
- [ ] `OC-18` — Todas as telas seguem o design system do projeto, e o shell tem o cabeçalho com nome, papel, domínio e
  Sair, o menu lateral conforme as permissões, os breadcrumbs e o tema claro e escuro (PRD §6, Layout base). Evidência:
  o `UI-02`, o `visual-frontend` verde e o `Docs-01` (a cópia limpa do design system).
- [ ] `OC-19` — Para os usuários de domínio, o domínio vem sempre do token. O domínio que o `platform_admin` escolhe
  (`X-Domain-Id`) é validado no backend (PRD §6, Autorização; decisão do usuário). Evidência: o `Authz-01`.
- [ ] `OC-20` — O backend devolve 404 quando o recurso não existe ou é de outro domínio, e o frontend mostra *"Página não
  encontrada."*, inclusive quando a tela foi aberta pela URL (PRD §6, Acesso negado no frontend). Evidência: o teste e2e
  da URL inexistente e o teste unitário do `errorInterceptor` com um 404.
- [ ] `OC-21` — As permissões vêm do catálogo da migration (400 `users.read`, 401 `playground.read`), são lidas a cada
  requisição, e o frontend esconde do menu e bloqueia nas rotas o que o papel não pode usar (PRD §6, Permissões).
  Evidência: o `Data-01`, o teste `permissions-catalog`, o `UI-02` e o `UI-03`.
- [ ] `OC-22` — O harness e2e loga os três perfis pela API, as contas do seed estão no lugar, o `admin` e o `user` estão
  no mesmo domínio, e o `e2e-frontend` e o `visual-frontend` estão verdes e na cadeia padrão (decisões do usuário;
  `GATES.md`). Evidência: a rodada posterior da `gate-builder` registrada no Histórico do `GATES.md` e os dois gates
  verdes na avaliação.
- [ ] `OC-23` — Documentação e convenções (`CLAUDE.md`): os três modelos `.env` com a variável nova, a seção do README,
  o `GATES.md` atualizado, o seed no `./dev.sh` e nenhuma ocorrência do nome do sistema de origem nos arquivos e no
  histórico a enviar. Evidência: o `Docs-01`.

## Test-suite hint

A F04 tem um e2e (o `e2e-frontend`, provado na rodada posterior da `gate-builder`) e um gate visual (o
`visual-frontend`). Cada comportamento de UI está numa linha só. Os fluxos que passam pelo formulário de login, pelo
logout ou por um token alterado não são e2e: as regras A1 e A2 da `e2e-test-writer` proíbem logar dentro de um teste e
forjar um token.

| Superfície / comportamento | Suíte |
|---|---|
| `Auth-01` — validação, regras de senha, bloqueio, hora local, 503 do Redis, JWT | unit (`tests-backend`) |
| `Auth-01` — login das identidades, mesma mensagem, 72 bytes, bloqueio e desbloqueio, domínio inativo, 429, bcrypt | integration (`tests-integration-backend`) |
| `Session-01` — 401, logout, `/v2/me`, troca de papel, domínio inativo | integration (`tests-integration-backend`) |
| `Session-01` — 503 com o MySQL fora | unit (`tests-backend`) + runtime-only (`UI-04`) |
| `Authz-01` — 403, `X-Domain-Id`, `requirePlatformAdmin` | integration (`tests-integration-backend`) + unit (`tests-backend`) |
| `Boot-01` — criação única e e-mail em conflito | integration (`tests-integration-backend`) + unit (`tests-backend`) |
| `Boot-01` — backend não sobe com a senha fora das regras | unit (`tests-backend`) + runtime-only (`docker compose run`) |
| `Data-01` — tabelas, catálogo, mapa por papel | integration (`tests-integration-backend`) |
| `Data-01` — seed, hash nos dados do `./dev.sh`, senha ausente dos logs | runtime-only |
| `UI-01` — formulário, botão Entrar desabilitado com campo vazio, mensagens de 401, 403, 423, 429 e 503 e da falha de rede no card | unit (`tests-frontend`) |
| `UI-01` — login de cada conta pela tela → destino do papel | runtime-only (regra A1: o fluxo é o próprio login) |
| `UI-01` — sessão guardada em `/` e em `/login` → destino do papel | e2e |
| `UI-01` — e-mail inexistente → mensagem de credencial inválida | runtime-only (regra A1) |
| `UI-01` — conta do domínio inativo → mensagem do domínio desativado | runtime-only (regra A1) |
| `UI-01` — Sair → mensagem e token antigo com 401; logout com erro apaga a sessão local | unit (`tests-frontend`) + runtime-only (regra A1: exige um login próprio) |
| `UI-01` — token adulterado ou vencido → login com a mensagem de sessão expirada | unit (`tests-frontend`) + runtime-only (regra A2: o teste não pode forjar um token) |
| `UI-02` — cabeçalho com nome, papel e domínio por papel | unit (`tests-frontend`) + runtime-only |
| `UI-02` — itens do menu por papel | unit (`tests-frontend`) |
| `UI-02` — clicar num item do menu → rota, destaque, título, breadcrumb e aviso da tela provisória | e2e |
| `UI-02` — ícone de tema → classe do `<body>` trocada e persistida depois de recarregar | unit (`tests-frontend`: `ThemeService` e o clique no cabeçalho) + `visual-frontend` (que alterna os dois temas): o tema não é um fluxo e2e (lista de resultados da `e2e-test-writer`) |
| `UI-02` — alturas: cabeçalho 46 px, item do menu 32 px, `.mat-mdc-text-field-wrapper` do login 38 px, botões 32 px | `visual-frontend` |
| `UI-02` — tipografia: Open Sans no `body`, `h1` do page shell 17 px/600, título do login 15 px/600 | `visual-frontend` |
| `UI-02` — tema escuro: superfície da página e do card diferente do claro, texto com contraste ≥ 4,5:1, item ativo do menu com o `primary-container` | `visual-frontend` |
| `UI-03` — `user` abre `/users` e `/domains` pela URL → acesso negado, URL mantida, shell visível, menu sem as duas | e2e |
| `UI-03` — URL inexistente → página não encontrada | e2e |
| `UI-03` — 403 da API recarrega o `/v2/me` e atualiza o menu; 404 da API → página não encontrada | unit (`tests-frontend`): nenhuma rota da F04 devolve 403 ou 404 a quem vê a tela |
| `UI-04` — 503 ou falha de rede com o app aberto → snackbar, sem deslogar | unit (`tests-frontend`): nenhuma tela da F04 chama a API depois de carregar |
| `UI-04` — MySQL parado ao recarregar → `/unavailable`, e "Tentar novamente" volta sem novo login | unit (`tests-frontend`) + runtime-only (parar o MySQL afetaria os outros testes) |
| `UI-04` — Redis parado → login com 503 e navegação do logado sem erro | runtime-only (idem) |
| `Docs-01` | runtime-only (inspeção, conferência privada e buscas de confidencialidade) |
| `GET /v2/me` — `integration — query growth` | `should not grow the number of queries with the number of permissions of the role` |
| `POST /v2/auth/login` — `integration — query growth` | `not measurable — write endpoint` |
| `POST /v2/auth/logout` — `integration — query growth` | `not measurable — write endpoint` |
