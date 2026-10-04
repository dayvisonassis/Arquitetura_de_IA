# Plano de implementação: F04. Autenticação do sistema

**Pré-requisitos:**
- Node 22.13.0 (`.nvmrc`) e `npm ci` feito no `apps/backend`, no `apps/frontend` (com o `.npmrc`) e na raiz.
- F01 concluída (CLEAN): o `database.js`, o `redis-client.js`, o `src/config/env`, o request ID, o CORS, os schemas `web`
  e `web_test`, e o harness e2e com os perfis `admin` e `user`.
- **Rodada prévia da `gate-builder`** (spec §3, "Gates"):
  - o harness e2e completo: o perfil `platform_admin`, o login pela API no global setup e as variáveis `E2E_*`;
  - a estrutura do `visual-frontend`;
  - a configuração anti-bot e a política de dados documentadas no `GATES.md`.
- Para os testes de integração: o `./dev.sh --infra` no ar e o `apps/backend/.env.testing` local.
- Para conferir no ambiente completo: o `./dev.sh`, com os containers do backend e do frontend reiniciados depois da
  mudança dos lockfiles, e o `LOGIN_RATE_LIMIT_MAX=200` no `apps/backend/.env.development` local.
- **Confidencialidade:** antes de cada commit, o `git grep` da regra de confidencialidade. A cópia do design system nasce
  limpa.

### Etapa 1: Base do backend

**1. Dependências e configuração** - Acrescentar ao backend as bibliotecas de token, hash, validação e limite de
tentativas, e estender a configuração com as regras de conteúdo do e-mail e da senha do primeiro administrador e com o
teto de tentativas de login, atualizando os três modelos de ambiente e o arquivo local de desenvolvimento (spec §4 e
§5, "Configuração").

**2. Utilitários compartilhados** - Criar as regras de senha e de e-mail, a hora local do desbloqueio, a classificação
dos erros de banco indisponível e o erro de aplicação com as mensagens da spec (§4 e §5).

**3. Infraestrutura HTTP** - Estender o tratamento de erros para o erro de aplicação e para o banco indisponível,
redigir o header de autorização nos logs, aceitar o header do domínio escolhido no CORS, dar prazo curto às conexões do
banco e expor o cliente Redis com conexão sob demanda e sem fila offline (spec §2 e §4).

### Etapa 2: Dados e identidades

**4. Migrations** - Criar as tabelas da cópia dos domínios, das duas identidades, das sessões ativas e do catálogo de
permissões com o mapa por papel, já com as permissões da F04, na ordem da spec (§6).

**5. Models** - Criar os models das sessões, das duas identidades, da cópia dos domínios e das permissões, com as
consultas e as revogações que a spec define para a F04 e para as features seguintes (§4 e §5, "Interfaces internas").

**6. Primeiro administrador** - Criar o serviço que garante o administrador da plataforma na partida e o serviço de
e-mail único entre as identidades, e chamar a garantia no ponto de entrada antes de abrir a porta (spec §5, "Primeiro
administrador").

**7. Seed de desenvolvimento** - Criar o seed idempotente com os dois domínios e as três contas, e fazer o `./dev.sh`
aplicá-lo depois das migrations (spec §6, "Seed de desenvolvimento").

### Etapa 3: API de autenticação

**8. Login e logout** - Criar o serviço de login com o bloqueio por conta, a conferência do domínio, a sessão e o
token, e o logout que revoga a sessão, com o controller e as rotas (spec §2 e §5).

**9. Limite por IP** - Criar o middleware que limita as tentativas de login por IP no Redis, com o teto da
configuração, o store criado no primeiro uso e a resposta de indisponibilidade quando o Redis falha (spec §3 e §5).

**10. Autenticação e autorização** - Criar o middleware que confere o token e a sessão a cada requisição e monta o
contexto da requisição, e os middlewares de permissão, com a validação do domínio escolhido pelo administrador da
plataforma, e de rota exclusiva da plataforma (spec §5, "Contexto da requisição").

**11. Usuário logado e montagem** - Criar o endpoint do usuário logado e montar a API `/v2` com o login público, a
autenticação para o resto e as rotas novas (spec §2 e §5).

**12. Utilitários de integração** - Completar o preparo do banco de teste com o domínio e o usuário de integração, e
criar a geração de token com sessão, a limpeza do limite de login e os auxiliares de criação de domínios e de
identidades de teste (spec §4 e §7).

### Etapa 4: Base do frontend

**13. Material, tema e estilos globais** - Instalar o Angular Material e as fontes empacotadas, criar o tema claro e
escuro pelas tabelas do design system e os estilos globais do page shell e dos tokens, e registrar as animações no
bootstrap (spec §3 e §4).

**14. Cópia do design system** - Criar `docs/design-system/angular-material.md` adaptada ao AI Gateway, conforme as
regras de manter, trocar e tirar da spec, e apontar o gate de estilos do `GATES.md` para ela (spec §5, "Design system" e
"GATES.md").

**15. Sessão no frontend** - Criar os serviços de sessão, do usuário logado, de tema e de avisos, e os interceptores
do token e dos erros HTTP, registrando o cliente HTTP com eles no bootstrap (spec §5, "Frontend").

**16. Login** - Criar o layout das telas de autenticação e a tela de login, com as mensagens da spec e o destino por
papel (spec §5, "Textos").

**17. Shell** - Criar o layout autenticado com o cabeçalho, o menu lateral por permissão, os breadcrumbs e a troca de
tema (spec §5, "Menu" e "Cabeçalho").

**18. Rotas, guards e páginas** - Criar os guards, as telas provisórias e as páginas de acesso negado, de página não
encontrada e de indisponibilidade, e montar a tabela de rotas (spec §5, "Rotas").

### Etapa 5: Documentação

**19. README** - Acrescentar a seção de autenticação: as contas do seed, o primeiro administrador, o teto de tentativas
do ambiente de desenvolvimento e como desbloquear uma conta localmente (spec §4, "Raiz e documentação").

**Depois da implementação** (spec §3, "Ordem depois da spec"):
1. a rodada posterior da `gate-builder` prova o `e2e-frontend` e o `visual-frontend` contra o `./dev.sh` e os põe na
   cadeia padrão;
2. a `e2e-test-writer` escreve os testes das linhas `e2e` do contrato, confirmados pela `e2e-test-validator`;
3. o `evaluator` roda.
