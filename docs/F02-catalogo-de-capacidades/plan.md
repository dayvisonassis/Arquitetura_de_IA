# Plano de implementação: F02. Catálogo de capacidades

**Pré-requisitos:**
- Node 22.13.0 (`.nvmrc`) e `npm ci` feito no `apps/ia` e na raiz.
- F01 concluída (CLEAN): configuração, `getDb`, cliente Redis, master key e formato de erro do proxy.
- Para os gates de integração: `./dev.sh --infra` no ar, com MySQL e Redis `healthy`, e o `apps/ia/.env.testing` local.
- Para conferir no ambiente completo: `./dev.sh`, com as chaves dos provedores no `apps/ia/.env.development`.
- Nenhuma rodada da `gate-builder`: a F02 não pede gate novo (spec §3, "Gates").

### Etapa 1: Definição e validação do catálogo

**1. Dependência e configuração** - Acrescentar o Joi ao proxy e a variável opcional do caminho do catálogo ao módulo de
configuração e aos três modelos de ambiente, com o padrão da spec (§5, Configuração).

**2. Carregador e validador** - Criar o módulo de configuração do catálogo, que lê o arquivo, aplica o esquema e as
checagens cruzadas da spec (§5, O arquivo do catálogo) e reúne todos os problemas encontrados, sem expor valores de
credencial.

**3. Catálogo inicial** - Criar o arquivo versionado com as três capacidades e os cinco deployments da spec (§5,
Catálogo inicial), com os preços e os parâmetros fixos definidos.

**4. Recusa na partida** - Fazer o ponto de entrada do proxy validar o catálogo depois da configuração e sair com uma
linha por problema antes de abrir a porta (spec §2, Partida do proxy).

### Etapa 2: Estado em tempo real

**5. Tabela de suspensões** - Criar a migration da tabela de suspensões no schema do proxy, conforme a spec (§6).

**6. Acesso ao Redis** - Expor no cliente Redis do proxy o acesso ao cliente pronto, com uma única conexão compartilhada
e a falha rápida da spec (§3, "Falha rápida"), mantendo o ping do health sobre o mesmo acesso.

**7. Serviço de estado** - Criar o serviço que mantém a réplica das suspensões no Redis, recarrega a réplica a partir do
MySQL quando ela some, lê o cooldown, suspende e reativa na ordem de escrita e no prazo da spec (§3), corrige a réplica
quando ela diverge do MySQL e calcula os avisos de capacidade indisponível.

### Etapa 3: API administrativa

**8. Controller e rotas do catálogo** - Criar a leitura do catálogo com o estado e as ações de suspender e reativar
capacidades e deployments, com as validações, os códigos de erro, os avisos e o log descritos na spec (§5), e montar as
rotas atrás da master key.

### Etapa 4: Documentação

**9. README** - Acrescentar ao `README.md` a seção sobre o catálogo: onde fica o arquivo, como reiniciar o proxy depois
de editá-lo, como trocar o arquivo pela variável de ambiente, o que acontece com um catálogo inválido e como suspender e
reativar pela API.
