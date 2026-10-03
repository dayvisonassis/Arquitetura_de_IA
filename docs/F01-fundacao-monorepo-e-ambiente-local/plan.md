# Plano de implementação: F01. Fundação, monorepo e ambiente local

**Pré-requisitos:**
- Node 22.13.0 (`.nvmrc`) e npm; `npm ci` feito nos quatro apps e `npm install` na raiz.
- Docker Desktop **rodando**, com Compose v2+.
- Portas 3306, 6379, 4200, 3030 e 3131 livres no host.
- **Rodada da `gate-builder` concluída antes deste plano**, com as mudanças de gates descritas na spec (§3, "Gates").
  O `implement-feature` não altera gates.
- **A partir da etapa 2**, a infraestrutura precisa estar no ar para os gates de integração: `./dev.sh --infra`,
  criado na etapa 1.

### Etapa 1: Infraestrutura local

**1. Compose de infraestrutura** - Criar o compose de infra com MySQL e Redis, imagens fixadas por digest, portas
publicadas só em `127.0.0.1`, healthchecks e a rede compartilhada, conforme a spec (§4, Raiz).

**2. Schemas e usuários do MySQL** - Criar o script de init que monta os quatro schemas e os dois usuários isolados da
spec (§6), e o modelo versionado das senhas da infra. Acrescentar o arquivo local dessas senhas ao `.gitignore`.

**3. dev.sh, parte da infraestrutura** - Criar o `./dev.sh` com as verificações do Docker e do arquivo de senhas da
infra, a rede compartilhada, a opção que sobe só a infraestrutura com espera pelos healthchecks e a derrubada. Criar o
arquivo local de senhas da infra com valores gerados na hora e subir a infraestrutura.

### Etapa 2: Configuração, acesso a dados e base de integração

**4. Configuração do backend** - Criar o loader, o módulo de configuração com a validação na partida e os três modelos
de ambiente do backend, com todas as variáveis da spec (§5, Configuração).

**5. Configuração do proxy e do simulador** - Repetir o desenho no proxy, com as variáveis dele, e no simulador, só com
porta, host e nível de log.

**6. Arquivos locais de ambiente dos apps** - Criar, a partir dos modelos, os arquivos locais de ambiente dos apps, com
as senhas da infra e chaves de desenvolvimento geradas na hora. Levar as chaves dos provedores do arquivo raiz para o
do proxy, sem exibir valores, e remover o modelo de ambiente da raiz.

**7. Acesso a dados** - Criar no backend e no proxy o módulo de banco com leitura e escrita separadas, o knexfile, o
cliente Redis e as pastas de migrations e seeds (spec §4). Incluir os módulos da raiz do backend no build.

**8. Base de integração** - Criar os utilitários de preparo e limpeza de banco do backend e do proxy, o contador de
consultas do backend, a guarda contra os hosts dos provedores e os scripts que aplicam as migrations do ambiente de
teste antes da suíte de integração (spec §7, Harness de integração).

**9. Conversão de UUID** - Criar o par de conversão UUID ↔ binário no backend e no proxy, com o contrato da spec.

### Etapa 3: Comportamento HTTP transversal

**10. Logger e request ID** - Acrescentar o logger e o middleware de request ID ao backend e ao proxy, no início do
pipeline (spec §2 e §5).

**11. Erros e CORS do backend** - Criar o tratamento de rota inexistente, JSON inválido e erro interno, e o CORS restrito
à origem do frontend, com a recusa explícita das outras origens. Mudar o export do app para a forma da spec (§3).

**12. Erros e master key do proxy** - Criar o formato de erro do proxy, o roteador `/admin` com a autenticação por
master key, e a resposta de rota inexistente dentro e fora de `/admin`.

**13. Health checks** - Criar o `live` e o `ready` no backend e no proxy, e o `live` no simulador, com as checagens da
spec.

**14. Cliente da API administrativa e `/v2`** - Criar no backend o cliente que chama o `/admin` do proxy, repassando o
request ID, e montar o roteador `/v2` vazio.

**15. URL do backend no frontend** - Criar os arquivos de environment com a URL do backend, a troca para produção no
build e o script de servidor de desenvolvimento para container.

### Etapa 4: Contratos

**16. Mecanismo de contratos** - Instalar o Pact no backend e no proxy, gerar o primeiro contrato com as duas
interações da spec (§5, Contrato Pact), verificá-lo contra o proxy e documentar o mecanismo em `contracts/README.md`.

### Etapa 5: Containers dos apps e documentação

**17. Dockerfiles e entrypoint** - Criar os Dockerfiles de desenvolvimento dos quatro apps e o entrypoint que só
reinstala as dependências quando o lockfile muda, com os scripts de recarga para container de cada app.

**18. Compose dos apps** - Criar o compose dos quatro apps na rede compartilhada, com os overrides de host para dentro
dos containers, os healthchecks pelos endpoints de health e o simulador sem porta publicada.

**19. dev.sh completo** - Completar o `./dev.sh` com as verificações dos arquivos de ambiente dos apps e das senhas, as
migrations e a subida dos apps com espera pelos healthchecks, mantendo a opção só de infraestrutura.

**20. Documentação** - Atualizar o `README.md` e o `CLAUDE.md` com o preparo dos arquivos de ambiente, o `./dev.sh` e
a opção só de infraestrutura, os testes de integração, a leitura dos logs, a recriação do volume do MySQL e a regra dos
modelos de ambiente.
