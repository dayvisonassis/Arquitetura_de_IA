# Contract — F03 Destino de IA simulado

> Contrato operacional desta feature, gerado pelo `spec-writer` a partir do PRD e da spec.
> O `implement-feature` precisa cumpri-lo, e o `evaluator` valida contra ele.

## Environment Contract

Sem isto, a avaliação não começa (ambiente inválido ≠ implementação errada).

- **Docker Desktop rodando** (`docker info` responde), com as portas `127.0.0.1:3306`, `:6379`, `:4200`, `:3030` e
  `:3131` livres para o ambiente do projeto.
- **Node 22** e `npm ci` feito no `apps/ia_simulator` (com o `joi` e o `ts-node`), no `apps/ia` e na raiz.
- **Arquivos locais da F01**, nenhum deles versionado: `.env.infra`, `apps/ia/.env.development`,
  `apps/ia/.env.testing` e `apps/ia_simulator/.env.development`. O simulador não precisa de `.env.testing`.
- **Gate de integração do proxy (`tests-integration-ia`):** precisa do `./dev.sh --infra`, com MySQL e Redis `healthy`.
- **Gate de integração do simulador (`tests-integration-ia_simulator`):** não precisa de infraestrutura, porque os
  testes sobem o simulador como processo filho.
- **Para os critérios de runtime:**
  - `./dev.sh` executado e os seis serviços `healthy`;
  - o container do simulador reiniciado depois da mudança do lockfile
    (`docker compose -p ai-gateway-app restart ia_simulator`), para que o entrypoint rode o `npm ci`.
- **Chamadas ao simulador do `./dev.sh`:** sempre de dentro da rede, pelo container do proxy.
  - Use um script ESM salvo no scratchpad, em UTF-8, e envie-o pelo Git Bash, a partir da raiz:
    `docker compose -p ai-gateway-app exec -T ia node --input-type=module - < "<scratchpad>/sim.mjs"`.
  - No script: `const SIM = 'http://ia_simulator:3132'` e o `fetch` do Node 22. Imprima status, headers, corpo e tempo
    medido.
  - Antes de cada verificação, faça um `POST /control/reset`.
  - Não ponha texto com acento em argumentos de linha de comando: o Git Bash e o `curl` corrompem os acentos. Dentro do
    script UTF-8, eles chegam intactos.
- **Sem navegador:** a F03 não tem tela.

## Quality Gates

Rodados da raiz, com `npm run gate:<id>`. As regras de cada um estão no `GATES.md`. A cadeia padrão (`npm run gate`)
precisa passar inteira. Os gates de apps que a F03 não altera dão `PASS (nothing to check)`.

- [ ] `typecheck-monorepo` — `tsc --noEmit -p tsconfig.eslint.json` no `ia_simulator` e no `ia` (o teste novo do
  catálogo simulado).
- [ ] `lint-monorepo` — ESLint com zero warnings:
  - no `ia_simulator` inteiro, porque a F03 muda o `package.json`, o lockfile e o `jest.config.js` dele;
  - nos `.ts` alterados do `ia`.
- [ ] `build-monorepo` — `tsc -p tsconfig.json` nos dois apps.
- [ ] `arch` — dependency-cruiser + `check-architecture`:
  - nenhum app importa o outro (o teste do proxy lê o JSON; o helper do simulador não importa o proxy);
  - controllers não importam routes; services não importam controllers nem routes;
  - só o `index.ts` abre porta, e o `process.env` só aparece em `src/config/**`, `index` e `loader` (o helper fica em
    `__tests__`, fora das duas regras).
- [ ] `tests-monorepo` — a suíte unitária inteira do simulador, com cobertura ≥ 80% sobre todo o `src/`. No `ia`, nenhum
  fonte muda: `PASS (nothing to check)`.
- [ ] `tests-integration-ia` — `migrations:test` + `__tests__/integration` (inclui o `catalog-simulated`) +
  `__tests__/contracts` do proxy. Precisa do `./dev.sh --infra`.
- [ ] `tests-integration-ia_simulator` — **gate novo, construído pela `gate-builder` antes da implementação**:
  `npm run test:integration` no simulador, contra o processo real, sem infraestrutura.
- [ ] `deadcode` — knip nos dois apps: nenhum export sem uso; o `joi` e o `ts-node` usados.

O `e2e-frontend` não se aplica (sem tela).

## Coverage Manifest

- `Sim-01` (HTTP · `POST /v1/chat/completions` do simulador) → formato, modos, `usage`, corte no limite, credencial,
  validação e erros.
- `Ctrl-01` (HTTP · `/control/*` do simulador) → configuração e validação dos modos, `times`, `Retry-After`, estatísticas
  com o registro das chamadas, e reset.
- `Net-01` (rede e processo) → isolamento no compose (critério 5) e a instância de teste no host.
- `Catalog-01` (arquivo · `apps/ia/catalog/catalog.simulated.json`) → validade sem credenciais, espelho do real e um
  modelo por deployment.
- `Docs-01` (documentação e scripts) → a seção do README e o `npm test` só com os unitários.

## Surfaces & Behaviors

### Surface: `Sim-01` — endpoint de completions do simulador
- **Estado inicial:** `./dev.sh` no ar; `POST /control/reset` feito.
- **Comportamentos** (chamadas pelo script do Environment Contract):
  - [ ] Sem modo configurado, `gpt-4.1-mini` com a requisição da spec (§5) → 200 `chat.completion`, com:
    - `model: gpt-4.1-mini` e conteúdo `Resposta simulada.`;
    - `usage` 10/5/15 e `finish_reason: stop`;
    - `id` começando com `chatcmpl-sim-`.
  - [ ] A mesma chamada sem `Authorization`, com `Bearer qualquer` e com `Basic x` → 200 nas três.
  - [ ] Corte no limite, sempre com o modelo sem modo configurado:
    - a requisição da spec (§5) com `max_completion_tokens: 2` no lugar de 256 → conteúdo `Resposta`,
      `finish_reason: length` e `completion_tokens: 2`;
    - a mesma requisição sem `max_completion_tokens` e com `max_tokens: 2` → o mesmo resultado;
    - com `max_completion_tokens: 256` e `max_tokens: 2` juntos → vale o 256, sem corte (`Resposta simulada.`,
      `finish_reason: stop`).
  - [ ] Modo `error` com cada status (400, 401, 403, 404, 429, 500, 502 e 503) → o status e o corpo da tabela da spec
    (§5), com o 400 no `code` `unsupported_parameter`. Com `retry_after_seconds: 2` no 429, o header `Retry-After: 2`.
  - [ ] Modo `slow` com `delay_ms: 15000` → a resposta chega depois de 15 s e antes de 20 s, pelo tempo medido no script.
  - [ ] Modo `timeout` →
    - o script desiste depois de 5 s, sem resposta;
    - o `GET /control/stats` conta a chamada;
    - o simulador continua respondendo a outra chamada.
  - [ ] Modo `fenced-json` → o conteúdo é a cerca `json` da spec (§5), com
    `{"category": "billing", "reason": "Cobrança duplicada na assinatura."}` dentro, e o miolo passa no `JSON.parse`.
  - [ ] Modo `invalid-json` → o `JSON.parse` do conteúdo falha.
  - [ ] Corpo sem `model`, ou com `messages` vazio → 400 `invalid_request`, citando o campo. A chamada não é contada.

### Surface: `Ctrl-01` — API de controle
- **Estado inicial:** como no `Sim-01`.
- **Comportamentos:**
  - [ ] `POST /control/modes` válido → 200, com o modo e o `remaining_calls`. O `GET /control/modes` mostra o mesmo.
  - [ ] Cada valor abaixo → 400 `invalid_value` citando o campo, sem mudar nada:
    - `status: 418`;
    - `delay_ms: 120001`;
    - `retry_after_seconds` com `status: 500`;
    - `content` que não é JSON no `fenced-json`;
    - `content` em JSON no `invalid-json`;
    - um campo `foo`;
    - `mode: crash`.
  - [ ] `times: 2` em `error` 503 → duas chamadas 503, e a terceira 200.
  - [ ] `GET /control/stats` → `calls` por modelo e as últimas chamadas com `received_at`, `mode` e o corpo enviado,
    inclusive o `max_completion_tokens` e o `response_format`, sem headers.
  - [ ] 25 chamadas ao mesmo modelo → `calls: 25` e 20 itens em `requests`.
  - [ ] `POST /control/reset` → 204. Em seguida, o `GET /control/modes` e o `GET /control/stats` voltam vazios.

### Surface: `Net-01` — isolamento e instância de teste
- **Estado inicial:**
  - `./dev.sh` no ar;
  - nenhuma instância do simulador ou do proxy rodando no host, fora dos containers: as portas 3132 e 3141 do host
    livres. Uma instância esquecida (por exemplo, um `npm run start:testing` sem `PORT`, que usa a 3132) daria um falso
    resultado na verificação do `curl`.
- **Comportamentos:**
  - [ ] `docker compose -p ai-gateway-app ps --format '{{.Service}} {{.Ports}}'` → o `ia_simulator` sem nenhum
    mapeamento para o host (nenhum `->` na coluna de portas).
  - [ ] No host, `curl -s -m 3 -o /dev/null -w '%{http_code}' http://127.0.0.1:3132/health/live` → `000`.
  - [ ] De dentro do container do proxy, `fetch('http://ia_simulator:3132/health/live')` → 200.
  - [ ] `cd apps/ia_simulator && npm run test:integration` passa com ou sem o `./dev.sh` no ar, porque os testes usam
    uma porta livre do host, e o container do simulador não publica porta no host. O Jest termina sozinho, sem aviso de handles abertos. É a prova de que os testes
    sobem e encerram o processo real.

### Surface: `Catalog-01` — catálogo simulado
- **Estado inicial:** a árvore do `main` com a F03. Para a instância temporária, o `./dev.sh` no ar (MySQL e Redis) e a
  porta 3141 livre no host.
- **Comportamentos:**
  - [ ] Os três testes do `apps/ia/__tests__/integration/catalog-simulated.test.ts` passam.
  - [ ] O `apps/ia/catalog/catalog.simulated.json` tem as três capacidades e os cinco deployments do catálogo real,
    todos com `provider: simulated` e sem `credential_env` (inspeção).
  - [ ] Uma instância temporária do proxy no host sobe com o catálogo simulado:
    - comando, no Git Bash: `cd apps/ia && CATALOG_FILE=catalog/catalog.simulated.json PORT=3141 node -r ts-node/register/transpile-only index.ts`;
    - a porta 3141 evita disputar a 3131 com o container;
    - o `GET /admin/catalog` dela, com a master key, lista os cinco deployments com `provider: simulated`;
    - encerre a instância depois, pela porta (`netstat -ano` → `taskkill //PID <pid> //F`).

### Surface: `Docs-01` — documentação e scripts
- **Estado inicial:** a árvore do `main` com a F03.
- **Comportamentos:**
  - [ ] O `README.md` tem a seção "Destino simulado", com os itens da spec (§5, "README").
  - [ ] `cd apps/ia_simulator && npm test` roda só `__tests__/unit`: a saída não lista o `simulator.test.ts` de
    integração e não sobe nenhum processo.
  - [ ] Nenhum modelo `apps/ia_simulator/config/.env.*.example` mudou: a F03 não cria variável de ambiente.

## Observable Criteria

Rastreio para os critérios de aceite da F03 no PRD (§9) e para as regras da §6:

- [ ] `OC-01` — No modo `ok`, o destino responde no formato OpenAI, com `usage` determinístico (⌈caracteres ÷ 4⌉)
  (PRD AC 1).
  - Evidência: `usage` 10/5/15 no `Sim-01`.
  - Evidência: os testes `should answer ok with deterministic usage` (unitário e integração) e
    `should count characters as code points rounded up`.
- [ ] `OC-02` — No modo `error` com 503, toda chamada recebe 503, e o `GET /control/stats` conta cada uma (PRD AC 2).
  Evidência: três chamadas → três 503 e `calls: 3`, no runtime e no teste de integração.
- [ ] `OC-03` — No modo `slow` com 15.000 ms, a resposta só chega depois de 15 s (PRD AC 3). Evidência: o tempo medido
  no `Sim-01` e o teste de integração com o processo real.
- [ ] `OC-04` — No modo `fenced-json`, o conteúdo é um JSON válido entre crases, com a marcação `json` (PRD AC 4).
  Evidência: o `Sim-01` e os testes `should send valid JSON fenced as json` e `should wrap JSON in a json code fence`.
- [ ] `OC-05` — O destino não é acessível a partir do host, só pela rede interna do compose (PRD AC 5). Evidência: as
  três verificações de rede do `Net-01`.
- [ ] `OC-06` — Os demais modos seguem as regras do PRD (§6). Evidência: o `Sim-01`, os testes do controller e o teste de
  integração `should answer the definitive errors 400, 403 and 404 and count each call`.
  - `error` funciona com 400, 401, 403, 404, 429, 500 e 502 (o 503 está no `OC-02`), cobrindo os status das falhas
    definitivas e transitórias da F17;
  - `timeout` nunca responde e não trava o simulador;
  - `invalid-json` devolve um texto que não é JSON.
- [ ] `OC-07` — A API de controle recusa valores fora das faixas do PRD (status fora da lista, atraso acima de
  120.000 ms) e da spec, com 400 `invalid_value` citando o campo, sem mudar nada. Evidência: o `Ctrl-01` e o teste
  `should validate each mode`.
- [ ] `OC-08` — O simulador aceita qualquer `Authorization`, ou nenhum (PRD §6). Evidência: o `Sim-01` e o teste
  `should accept any or no Authorization header`.
- [ ] `OC-09` — Os extras decididos pelo usuário funcionam: o registro das últimas 20 chamadas, com horário, modo e
  corpo; o `times`; o `Retry-After`. Evidência: o `Ctrl-01`, o `Sim-01` e os testes correspondentes.
- [ ] `OC-10` — A resposta é cortada no limite de tokens, com `finish_reason: length` e `completion_tokens` igual ao
  limite (decisão do usuário). Evidência: o `Sim-01` e o teste `should cut the content at the token limit`.
- [ ] `OC-11` — O catálogo de testes aponta os deployments para o destino simulado, com os mesmos nomes de capacidade do
  catálogo real (PRD §6, Experiência), sem credenciais e espelhando o real. Evidência: o `Catalog-01`.
- [ ] `OC-12` — Os testes sobem o simulador no host como processo filho e o encerram, sem infraestrutura (PRD §6,
  Experiência; decisão do usuário), e o gate `tests-integration-ia_simulator` roda essa suíte. Evidência: o gate verde e
  a última verificação do `Net-01`.
- [ ] `OC-13` — Documentação e convenções (`CLAUDE.md`): a seção do README, o `npm test` do simulador só com
  `__tests__/unit` e nenhuma variável nova. Evidência: o `Docs-01`.

## Test-suite hint

A F03 não tem tela, então nenhuma linha é `e2e`.

| Superfície / comportamento | Suíte |
|---|---|
| `Sim-01` — formato, modos, `usage`, corte, credencial, validação | monorepo unit (`tests-monorepo`) |
| `Sim-01` — processo real pela rede: `ok`, `error` 503 com contagem, `slow` de 15 s, `timeout`, `fenced-json`, `Retry-After`, `times` e os erros definitivos 400, 403 e 404 | integration (`tests-integration-ia_simulator`) |
| `Ctrl-01` — validação, respostas, `times`, registro e reset | monorepo unit (`tests-monorepo`) |
| `Net-01` — sem porta no host; acesso pela rede interna | runtime-only |
| `Net-01` — instância de teste no host | integration (`tests-integration-ia_simulator`) |
| `Catalog-01` — validade, espelho e modelos únicos | integration (`tests-integration-ia`) |
| `Catalog-01` — partida do proxy com o catálogo simulado | runtime-only |
| `Docs-01` | runtime-only (inspeção) |
| crescimento de consultas | não se aplica: o simulador não tem banco |
