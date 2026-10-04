# Plano de implementação: F03. Destino de IA simulado

**Pré-requisitos:**
- Node 22.13.0 (`.nvmrc`) e `npm ci` feito no `apps/ia_simulator`, no `apps/ia` e na raiz.
- F01 e F02 concluídas (CLEAN): o esqueleto do simulador, o compose, a rede interna e o esquema do catálogo com o
  provedor `simulated`.
- **Rodada prévia da `gate-builder`:** o gate `tests-integration-ia_simulator` (spec §3, "Gate") criado, documentado no
  `GATES.md` e provado antes da implementação.
- Para o `tests-integration-ia`: o `./dev.sh --infra` no ar e o `apps/ia/.env.testing` local. O gate do simulador não
  precisa de infraestrutura.
- Para conferir no ambiente completo: o `./dev.sh`, com o container do simulador reiniciado depois da mudança do
  lockfile.

### Etapa 1: Base do simulador

**1. Dependências e scripts** - Acrescentar ao simulador a biblioteca de validação e o executor de TypeScript da partida
local, e ajustar os scripts e a configuração de execução do app conforme a spec (§3 e §4).

**2. Formato de erro** - Criar no simulador o formato de erro da OpenAI, a resposta para rota desconhecida e o
tratamento de JSON inválido, de corpo grande demais e de erro inesperado, com o limite de corpo da spec (§3 e §4).

### Etapa 2: Comportamento simulado

**3. Estado da simulação** - Criar o serviço que guarda em memória os modos e as estatísticas de cada modelo, aplica o
modo padrão e o número de chamadas de cada modo e mantém as chamadas mais recentes (spec §6).

**4. Montagem da resposta** - Criar o serviço que monta a resposta no formato da OpenAI, com o conteúdo de cada modo, o
uso de tokens determinístico e o corte no limite de tokens (spec §5).

**5. Endpoint de completions** - Criar a rota e o handler que validam a requisição, tomam e registram o modo e respondem
conforme ele, inclusive com a espera cancelável e a conexão sem resposta (spec §2 e §5).

**6. API de controle** - Criar as rotas e os handlers que configuram e listam os modos, devolvem as estatísticas e
zeram o estado, com a validação por modo da spec (§5).

### Etapa 3: Catálogo simulado e documentação

**7. Catálogo simulado** - Criar no proxy o catálogo de testes, espelho do catálogo versionado, com cada deployment
apontando para o provedor simulado e sem credencial (spec §3 e §4).

**8. README** - Acrescentar ao `README.md` a seção sobre o destino simulado: os modos, a API de controle, o uso no
ambiente local de dentro da rede, o catálogo simulado e a instância de teste no host (spec §5, "README").
