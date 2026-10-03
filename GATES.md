# Quality Gates

Checagens determinísticas de passa/falha. Os `id`s abaixo são os mesmos que o `spec-writer` declara no
`contract.md` de cada feature, e que o `implement-feature` e o `evaluator` executam com `npm run gate:<id>`.

Os gates só leem o código: nenhum deles altera código de aplicação.

## Como rodar

```bash
npm run gate                               # a cadeia padrão: tudo menos os gates optIn
npm run gate:lint-backend                  # um gate isolado (optIn incluídos)
node scripts/runGate.mjs tests-backend apps/backend/src/app.js
                                           # um gate com caminhos explícitos no lugar do diff
node scripts/runGate.mjs apps/ia           # a cadeia padrão sobre uma pasta inteira
GATE_BASE=HEAD npm run gate                # só o que ainda não foi commitado
```

O runner é [scripts/runGate.mjs](scripts/runGate.mjs). Ele roda os gates do mais barato ao mais caro, **para no
primeiro FAIL** e sai com código 1. No fim, imprime um resumo: `PASS`, `PASS (nothing to check)`, `SKIPPED`, `FAIL`
ou `NOT RUN`.

## Escopo: arquivos alterados

Os gates checam **o que a sua mudança alterou**.

- **Alterado** = diff contra o merge-base com a base, mais staged, unstaged e não rastreados. Arquivo novo é checado
  antes do commit.
- **Base:** `GATE_BASE`, se definido. Senão, o merge-base mais próximo do HEAD entre `origin/main` e `main`, ignorando
  o branch em que você está (no `main`, a base é o `origin/main`). Sem nenhum dos dois, só o que não foi commitado.
- **Caminhos explícitos** substituem o diff. Uma pasta vira todos os arquivos dela, rastreados ou não.
- **Um app sem arquivo alterado** deixa os gates dele em `PASS (nothing to check)`.
- **Mudou a configuração de um app** (`package.json`, `package-lock.json`, `.npmrc`, `.eslintrc.json`, `.stylelintrc.json`,
  `jest.config.js`, `babel.config.js`, `knip.json`, `angular.json` ou um tsconfig): lint e testes desse app passam a
  considerar o app inteiro.
- Os binários rodam com `node <bin>` e argumentos explícitos, sem shell: no Windows o `cmd.exe` não expande globs e
  corta linhas longas.

> **Durante um merge em andamento**, tudo o que o merge colocou em staged conta como alterado. Termine o merge ou
> passe caminhos explícitos antes de ler o resultado como um veredito sobre o seu trabalho.

## Gates

| id | Comando | Escopo |
|---|---|---|
| `typecheck-frontend` | `tsc --noEmit -p apps/frontend/tsconfig.gate.json` (código e specs) | frontend alterado |
| `typecheck-monorepo` | `tsc --noEmit -p tsconfig.eslint.json` (código e testes) | `ia`, `ia_simulator` alterados |
| `lint-backend` | `eslint --max-warnings 0 <.js alterados>` | backend |
| `raw-sql-backend` | regra `no-knex-raw` pela API do ESLint, depois do autoteste | `.js` alterados de `apps/backend/src` |
| `query-loop-backend` | regra `no-query-in-loop` pela API do ESLint, depois do autoteste | idem |
| `lint-frontend` | `eslint --max-warnings 0 <.ts/.html alterados>` | `apps/frontend/src` |
| `lint-monorepo` | `eslint --max-warnings 0 <.ts/.js alterados>` | `ia`, `ia_simulator` |
| `styles-frontend` | stylelint nos `.css` + regras de template nos `.html` + proibição de `.component.scss`, depois do autoteste | `apps/frontend/src` |
| `build-backend` | `npm run build` (Babel para `dist/`) | backend alterado |
| `build-monorepo` | `tsc -p tsconfig.json` (para `dist/`) | `ia`, `ia_simulator` alterados |
| `build-frontend` | `ng build` (produção, AOT) | **optIn**: o frontend inteiro, só por `npm run gate:build-frontend` |
| `arch` | dependency-cruiser + [scripts/check-architecture.mjs](scripts/check-architecture.mjs) | apps alterados |
| `tests-backend` | testes de `__tests__/unit` relacionados aos alterados, com cobertura; e o `test:contracts` inteiro, comparado com `contracts/pacts` (ver abaixo) | backend; os contratos também quando muda `contracts/pacts/**` |
| `tests-frontend` | specs relacionados aos alterados, com cobertura | frontend |
| `tests-monorepo` | testes de `__tests__/unit` relacionados aos alterados, com cobertura, por app | `ia`, `ia_simulator` |
| `tests-integration-backend` | `npm run test:integration` (MySQL e Redis de teste) | backend com `__tests__/integration`; provado em 2026-10-03 |
| `tests-integration-ia` | `npm run test:integration` e `npm run test:contracts` (verificação do provedor) | `ia` com `__tests__/integration`/`__tests__/contracts`, ou mudança em `contracts/**`; provado em 2026-10-03 |
| `deadcode` | `knip --directory apps/<app>` | apps alterados |
| `e2e-frontend` | `playwright test --config playwright.e2e.config.js` | **optIn**, ainda não provado verde (ver abaixo) |

Ordem da cadeia padrão: `typecheck-frontend → typecheck-monorepo → lint-backend → raw-sql-backend →
query-loop-backend → lint-frontend → lint-monorepo → styles-frontend → build-backend → build-monorepo → arch →
tests-backend → tests-frontend → tests-monorepo → tests-integration-backend → tests-integration-ia → deadcode`.

"Monorepo" aqui são os apps em TypeScript que não são o frontend: `ia` e `ia_simulator`. Um app novo entra em
`MONOREPO_APPS` (ou na constante equivalente) em [scripts/gates/scope.mjs](scripts/gates/scope.mjs).

### Decisões de desenho

| Tema | Decisão | Por quê |
|---|---|---|
| Baseline | Nenhuma: tudo bloqueia desde o primeiro commit. | Em 2026-10-03 os quatro apps tinham 0 warnings de lint e 0 erros de tipo. |
| Testes | `jest --findRelatedTests` com cobertura ≥ 80% **só nos fontes alterados**. | O PRD exige 80%. Medir só o código alterado também funciona num repositório com legado de baixa cobertura. |
| Build | `build-backend` e `build-monorepo` na cadeia padrão; `build-frontend` optIn. | O PRD põe o build de todos os apps no `npm run gate`. O `build-frontend` é optIn por decisão do time. |
| `arch` e `deadcode` | Por app, marcados como **experimentos**. | Medem se a ferramenta compensa antes de virar regra. |
| Gate e2e | `e2e-frontend`, no formato que a skill `e2e-test-writer` espera. | É o harness que as skills de teste do SDD procuram. |

## `typecheck-frontend` e `build-frontend`

O `tsc --noEmit` **não lê os templates do Angular**. Um binding para uma propriedade que não existe, um pipe com o
tipo errado ou um input renomeado só aparecem no build AOT. Por isso, **rode `npm run gate:build-frontend` antes de
abrir um PR que mexeu em template.** O gate chama o `ng build` direto, não o script `build` do app.

O `tsconfig.gate.json` inclui os specs, com os tipos do Jest, porque aqui não há legado com erro de tipo.

## Os gates de acesso a dados: `raw-sql-backend` e `query-loop-backend`

Duas regras bloqueantes para o código do backend: **nada de SQL raw novo** e **nada de consulta dentro de loop** (a
metade estática do N+1). As regras estão em [apps/backend/tools/eslint-rules/](apps/backend/tools/eslint-rules/) e o
runner as executa pela API do ESLint:

- **A configuração inline fica desligada**, então um comentário `eslint-disable` não as silencia.
- **O runner define as regras e a allowlist.** Mexer no `.eslintrc.json` do backend não muda nada nelas.
- **Antes de dar o veredito, cada execução roda o autoteste** das regras
  ([scripts/__tests__/data-access-rules.test.mjs](scripts/__tests__/data-access-rules.test.mjs)). Se ele falha, o gate falha.
- **Mudou algo em `apps/backend/tools/`** (regras ou allowlist): os dois gates checam todo o `src/`.

### `no-knex-raw`

Rejeita `raw`, `whereRaw`, `andWhereRaw`, `orWhereRaw`, `havingRaw`, `andHavingRaw`, `orHavingRaw`, `orderByRaw`,
`groupByRaw`, `joinRaw` e `fromRaw`, inclusive na forma `x['whereRaw'](…)`.

Não reporta:
- o `String.raw`;
- um `.raw()` sem argumento, ou com um objeto literal como primeiro argumento (`express.raw({ … })`), que é middleware.

| Mensagem | Significado | Allowlist? |
|---|---|---|
| `interpolated` | o SQL é um template com `${…}` ou uma concatenação com algo que não é literal | **nunca**: é o formato da injeção de SQL. Valores vão como bindings (`?`, e `??` para identificadores) |
| `dynamic` | o SQL chega numa variável ou expressão (`db.raw(sql)`, `parts.join(' ')`) | **nunca**: ninguém consegue revisar na chamada o que ela executa |
| `newRaw` | SQL literal | só com uma entrada revisada na allowlist |

**UUIDs:** o domínio (`dr_domain`) usa `BINARY(16)`. A F01 deve criar um helper (`uuidToBin`/`binToUuid`) que converte
no Node, para que `UUID_TO_BIN(?)` não vire SQL raw em cada model.

### `no-query-in-loop`

Rejeita uma chamada ao banco que roda **uma vez por item**:
- no corpo de `for`, `for…of`, `for…in`, `while` e `do…while`, e no teste ou no update de `for` e `while`
  (`while (await db('q').first())`);
- no callback de `map`, `flatMap`, `forEach`, `filter`, `reduce`, `reduceRight`, `some`, `every`, `find`,
  `findIndex`, `findLast`, `findLastIndex`, `Array.from(xs, cb)` e dos iteradores do lodash. Isso cobre o N+1 em
  paralelo, `Promise.all(ids.map(id => …))`;
- através de um callback inline dentro desses lugares (`withRetry(() => db(…))` num loop).

O que conta como chamada ao banco:
- **uma cadeia knex** que começa em `db`, `knex`, `trx`, `tx`, `dbRead`, `dbWrite` ou `transaction`, em
  `this.`/`self.`/`that.` um desses, em `getDb(…)`, ou numa variável inicializada a partir deles
  (`const reader = runner || this.dbRead`). Os nomes genéricos `database`, `runner`, `reader`, `writer`,
  `executor`, `connection` e `conn` só contam quando usados como knex: chamados direto (`runner('t')`) ou com um
  método do knex (`reader.select(…)`);
- **um builder aguardado:** `await q`, quando `q` guarda um builder (`const q = db('t')`);
- **uma chamada de model:** objeto com nome terminado em `Model`/`ModelInstance`, `this.xModel`, `model` ou
  `new XModel()`. Conta sempre que o resultado é usado como promise: `await`, `return`, corpo de arrow,
  `.then/.catch/.finally`, `push/unshift` ou elemento de array. Nas posições fracas (resultado descartado, argumento
  de uma chamada aguardada, atrás de `||`/`?:`), só conta se o método parece consulta (`create`, `update`, `delete`,
  `find`, `get`, `list`, `count`, …).

Um `db.raw(…)` dentro de uma cadeia knex (`.select(db.raw('COUNT(*)'))`) é **fragmento**, não consulta. Numa posição
de valor (argumento, `push`, elemento de array, valor de propriedade, corpo de arrow), também é fragmento, a menos que
o SQL comece com um comando (`SELECT`, `INSERT`, `UPDATE`, `DELETE`, DDL…).

Não reporta:
- `q = q.where(…)`, que compõe uma única consulta ao longo do loop;
- o que fica sob `.fn` (`trx.fn.now()`);
- `const rows = await db(…)` antes do loop;
- uma lista fixa de consultas diferentes em paralelo (`Promise.all([count, page])`).

**O padrão aceito:** carregar os itens numa consulta só e cruzar em memória (`whereIn` + `Map`). **Esconder o padrão da
regra não é correção:** renomear o handle, embrulhar a consulta num helper ou tirá-la de `src/` mantém o N+1. Uma
exceção honesta passa pela allowlist.

### A allowlist: [apps/backend/tools/data-access-allowlist.json](apps/backend/tools/data-access-allowlist.json)

O projeto proíbe comentários em código de produção, então a justificativa de uma exceção fica neste arquivo, que
aparece no diff de todo PR.

```json
{
  "rawSql": [
    {
      "file": "src/api/v2/models/usage.model.js",
      "sql": "JSON_EXTRACT(payload, '$.status') = ?",
      "reason": "JSON_EXTRACT has no knex builder equivalent",
      "feature": "F10",
      "approved": "<nome do revisor> <data>"
    }
  ],
  "queryInLoop": [
    {
      "file": "src/services/sequence.service.js",
      "function": "nextValue",
      "query": "trx('seq').select('last').where('id',id).forUpdate()",
      "reason": "retry loop on a sequence collision, not one query per item",
      "feature": "F07"
    }
  ]
}
```

- `file` é relativo a `apps/backend`. `sql` é o SQL literal; os espaços são colapsados antes de comparar.
- Uma entrada de `queryInLoop` vale para **`function` e `query`**. `query` é o código que o gate imprime depois de
  `code:` na mensagem. Uma segunda consulta na mesma função continua sendo reportada.
- **`reason` precisa de pelo menos 10 caracteres**, e `function` precisa nomear uma função (`<anonymous>` é recusado).
  Uma entrada inválida é **ignorada** (a chamada continua reportada), e o gate a lista.
- **`feature`** é o id da feature que acrescentou a entrada.
- **`approved` é preenchido só por um revisor humano**, com nome e data. Nenhum agente escreve esse campo.
- A entrada vale assim que entra no arquivo. A cada execução, o gate lista as entradas sem `approved` em
  `NEEDS HUMAN APPROVAL before merge`. Para o `evaluator`, qualquer entrada sem aprovação impede o estado CLEAN.
  O `fix-runner` nunca acrescenta entradas.
- O `implement-feature` só acrescenta uma entrada quando o padrão aceito não consegue expressar o código, e só nestas
  categorias:

| Allowlist | Categorias aceitas (valores sempre como bindings) |
|---|---|
| `rawSql` | SQL sem forma no builder: `CASE WHEN`, `COALESCE`/`IFNULL`/`IF()`, funções de data e de JSON, funções de texto, window functions, `ON DUPLICATE KEY UPDATE` |
| `queryInLoop` | loop de retry; processamento sequencial deliberado (lock por linha, fila ordenada); job que processa um item por iteração por desenho |

Limite conhecido: uma entrada que não casa com nenhum achado (velha ou escrita errada) não é aplicada nem reportada.

## `styles-frontend`: o design system

Aplica o subconjunto determinístico do design system. A fonte das regras é
`.claude/skills/pabx-design-system/references/angular-material.md`, versionado neste repositório. A F04 copia o
documento para `docs/design-system/angular-material.md`, junto com o tema. Regras subjetivas (densidade, hierarquia,
estética) **não entram no gate**: ficam para a verificação visual num navegador.

- **CSS**, pelo stylelint ([apps/frontend/.stylelintrc.json](apps/frontend/.stylelintrc.json) e o plugin local
  [apps/frontend/tools/stylelint-rules/](apps/frontend/tools/stylelint-rules/)), tudo como erro:
  - `tails/no-important-on-tokens`: token (`--*`) nunca leva `!important`;
  - `tails/no-hardcoded-hex`: cor só por token. O fallback `var(--token, #hex)` é aceito, e `src/themes/**`, onde
    os tokens são definidos, é exceção;
  - `color-no-invalid-hex` e `property-no-unknown`.
- **Templates HTML**, por regras locais do ESLint
  ([apps/frontend/tools/eslint-rules/](apps/frontend/tools/eslint-rules/)), todas bloqueantes:
  - `no-color-attr-on-buttons`: botão Material não recebe `color`. A exceção é `color="primary"` dentro de
    `mat-dialog-actions`;
  - `no-mat-paginator`: tabela paginada usa `tails-pagination`;
  - `require-aria-label-icon-button`: todo `mat-icon-button` tem `aria-label` ou `[attr.aria-label]`.
- **Nome de arquivo:** `.component.scss` é recusado; o estilo de componente é `.component.css`.
- Antes do veredito, roda o autoteste das regras
  ([scripts/__tests__/design-system-rules.test.mjs](scripts/__tests__/design-system-rules.test.mjs)). Mudou algo em
  `apps/frontend/tools/` ou na configuração: o gate checa todo o `src/`.

Só os `.css` passam pelo stylelint. O `styles.scss` global e os temas em `.scss` ficam fora.

## `arch`

| Regra | Ferramenta | Significado |
|---|---|---|
| `no-cross-app` | dependency-cruiser | um app só importa os próprios arquivos, os próprios `node_modules` e `contracts/` (PRD F01) |
| `not-to-unresolvable` | dependency-cruiser | todo import resolve para um arquivo ou pacote instalado |
| `no-circular` | dependency-cruiser | nenhum ciclo de import |
| `src-not-to-tests` | dependency-cruiser | `src/` não importa `__tests__/`, `tests/` nem arquivos `.spec`/`.test` |
| `backend-models-are-pure` | dependency-cruiser | models (`src/models` ou `src/api/v2/models`) não importam controllers, routes nem `express` |
| `backend-controllers-not-routes` | dependency-cruiser | controllers não importam routes |
| `backend-routes-only-wire` | dependency-cruiser | uma rota liga URL → permissão → controller e não chega a models ou services |
| `services-not-http-layer` | dependency-cruiser | services, em qualquer app, não importam controllers nem routes |
| `ia-controllers-not-routes` | dependency-cruiser | no `ia` e no `ia_simulator`, controllers não importam routes |
| `env-only-in-config` | check-architecture | nos apps de servidor, `process.env` só em `index.*`, `loader.*` e `src/config/**`; no frontend, nunca |
| `listen-only-in-index` | check-architecture | nos apps de servidor, `.listen(` só no `index.*`, para o `app` continuar testável sem abrir porta |

A configuração é [.dependency-cruiser.cjs](.dependency-cruiser.cjs), rodada por app, com o tsconfig do app (caminho
absoluto, senão o `extends` não resolve).

Em 2026-10-03, as regras de camada valiam para pastas que ainda não existem (a F01 as cria). Cada uma foi provada com um
arquivo de violação deliberada (ver Histórico).

## Testes e cobertura

Para cada app alterado:

1. Se mudou a configuração de teste, roda a suíte inteira com cobertura, e o limite vale para o app todo.
2. Senão, roda os testes relacionados aos arquivos alterados (`jest --listTests --findRelatedTests`). Um
   `.component.html`/`.css` alterado conta como o `.component.ts` ao lado.
3. **No backend, no `ia` e no `ia_simulator`, só os testes de `__tests__/unit` entram**, nos dois casos acima. O runner
   filtra a lista e roda os arquivos exatos com `--runTestsByPath`. Os testes de `__tests__/integration` e
   `__tests__/contracts` ficam com os gates de integração e com a conferência de contratos. O `--testPathPattern` não
   serve para isso: o jest o combina com os caminhos do `--findRelatedTests` num OU.
4. A cobertura é medida **só nos fontes alterados que entram no `collectCoverageFrom`** do app. O limite de 80% em
   linhas, statements, funções e branches está no `coverageThreshold` do `jest.config.js` de cada app, então o
   `npm run test:coverage` de cada app também o cobra.
5. **Um fonte alterado sem nenhum teste unitário relacionado faz o gate falhar** (`changed source with no related
   test`). Arquivos fora do `collectCoverageFrom` (`index.*`, `main.ts`, rotas) não precisam de teste.

As convenções dos testes estão nas skills do fluxo SDD. Este repositório segue o layout que elas esperam:
`unit-test-writer` (frontend e `apps/backend/__tests__/unit`), `integration-test-writer`
(`apps/backend/__tests__/integration`), `monorepo-unit-test-writer` (`ia`, `ia_simulator`) e `e2e-test-writer`
(`tests/e2e`). O `implement-feature` as aciona por feature. Nenhuma skill cobre `apps/ia/__tests__/integration` nem os
testes de contrato: o `implement-feature` os escreve pelo fallback.

## Gates de integração: `tests-integration-backend` e `tests-integration-ia`

Rodam fora dos containers, com `NODE_ENV=testing`, contra os schemas de teste (`web_test`, `gateway_test`) e os bancos
de teste do Redis, configurados no `apps/<app>/.env.testing` de cada app.

- **Partes, cada uma só quando a pasta dela existe:**
  - `__tests__/integration` → `npm run test:integration`, que aplica as migrations de teste antes;
  - `__tests__/contracts` → `npm run test:contracts`, **só no `ia`** (`verifiesContracts` no
    [scripts/runGate.mjs](scripts/runGate.mjs)): a verificação do provedor contra os pacts do backend. Os testes de
    contrato do backend são consumidores e ficam com o `tests-backend`, que os roda numa pasta temporária. Rodá-los
    aqui regravaria o pact versionado.

  Sem nenhuma das duas, o gate é no-op.
- **Quando roda:** o `tests-integration-backend` roda quando muda algo em `apps/backend/`. O `tests-integration-ia` roda
  quando muda algo em `apps/ia/`; mudança só em `contracts/**` roda apenas a parte de contratos.
- **Pasta sem o script npm:** se a pasta existe e o script não, o gate falha nomeando o script.
- **Os scripts não usam `--passWithNoTests`:** uma pasta que existe sem testes faz o gate falhar.
- **Precisa do MySQL e do Redis.** Antes de rodar, o gate abre uma conexão TCP com os hosts do `.env.testing`. Se o
  arquivo não existe, falha com o comando de cópia do modelo. Se um serviço não responde, falha com
  `not reachable: MySQL (127.0.0.1:3306)` e a instrução `./dev.sh --infra`.
- **`INTEGRATION_SKIP=1`** pula o gate com um banner de "não verificado", e o resumo marca `SKIPPED`.

### Estado: provados contra o banco real em 2026-10-03

Os dois gates foram criados antes da implementação da F01. Nessa rodada prévia, com arquivos temporários, ficou
provado:
- no-op sem as pastas;
- falha com pasta sem script;
- falha sem `.env.testing`;
- falha com MySQL fora do ar;
- `SKIPPED` com `INTEGRATION_SKIP=1`;
- disparo da parte de contratos por `contracts/**`.

Depois da implementação da F01, com o `./dev.sh --infra` no ar, a prova falha → passa foi feita contra o MySQL e o Redis
reais (detalhes no Histórico). Os dois gates estão na cadeia padrão e valem como gates de integração para as skills do
SDD.

## Conferência dos contratos (`tests-backend`)

O backend é o consumidor dos contratos com o proxy (Pact). Os pacts versionados ficam em `contracts/pacts/`.

- **Quando roda:** se mudou algo em `apps/backend/` ou em `contracts/pacts/**`, e existe `apps/backend/__tests__/contracts`.
- **O que faz:** o gate roda o `npm run test:contracts` do backend **inteiro**, com `PACT_DIR` numa pasta temporária.
  Depois compara o resultado com os pacts versionados do consumidor `ai-gateway-backend`
  ([scripts/gates/contracts.mjs](scripts/gates/contracts.mjs)).
  - **Comparação semântica:** interações indexadas pela descrição, comparando `request`, `response` e os provider
    states. A ordem e os metadados são ignorados.
  - **Falha** se faltar ou sobrar um arquivo, se uma interação mudar, aparecer ou sumir, ou se houver descrição
    duplicada, e diz como regenerar.
- **O gate nunca escreve em `contracts/`.** Regenerar é `cd apps/backend && npm run test:contracts`, e o pact entra no
  commit.
- **Autoteste antes do veredito:** a comparação tem um autoteste
  ([scripts/__tests__/pact-compare.test.mjs](scripts/__tests__/pact-compare.test.mjs)), que roda antes da conferência.
- **Pact sem consumidor:** se `contracts/pacts/` tem pacts do backend e o backend não tem `__tests__/contracts`, o gate
  falha.

A verificação do outro lado, a do provedor, é a parte de contratos do `tests-integration-ia`.

## `e2e-frontend`

O harness é do gate. Os testes de feature são da `e2e-test-writer`, que nunca edita o harness.

| Peça | Onde |
|---|---|
| Config do runner | [playwright.e2e.config.js](playwright.e2e.config.js) (CommonJS), `testDir: './tests/e2e'`, 1 worker, sem retry, headless, screenshot e trace em falha (`test-results/e2e/`) |
| Perfis | um projeto por sessão: `tests/e2e/admin/**` roda como `domain_admin`, `tests/e2e/agent/**` como `user`. As duas contas ficam **no mesmo domínio** |
| Sessão | [tests/e2e/global-setup.js](tests/e2e/global-setup.js) guarda a sessão em `tests/e2e/.auth/<perfil>.json` (ignorado pelo Git) e **a reaproveita entre execuções** enquanto o JWT não expira (margem de 5 min) |
| Sementes | `tests/e2e/<perfil>/harness-seed.spec.js`, uma por perfil: provam o harness, não o produto |
| Fixtures | [tests/e2e/fixtures.js](tests/e2e/fixtures.js) exporta `test` e `expect`, com `adminApi` e `agentApi`: request context na **origem do backend** (`E2E_API_URL`, padrão `http://127.0.0.1:3030`) com o Bearer da sessão. Os caminhos começam com `/v2/…` |
| URL do app | `E2E_BASE_URL`, padrão `http://127.0.0.1:4200` |
| Log do servidor | `docker compose logs` do container do app (ambiente do `./dev.sh`) |
| Gate | `npm run gate:e2e-frontend` |

- **Precisa do app no ar.** O gate não sobe o app. Se o frontend ou o backend não responder, falha mandando subir o
  ambiente com `./dev.sh`.
- **Roda headless.** Não abre janela. Isso é diferente da execução com navegador visível que um humano acompanha num
  smoke test (`playwright-cli open --headed`).
- **Escopo:** roda quando mudou algo em `apps/frontend/`, `apps/backend/`, `tests/e2e/` ou no
  `playwright.e2e.config.js`. Senão, é no-op. `E2E_FORCE=1` roda mesmo assim. `E2E_SKIP=1` pula com um banner de "não
  verificado": é a válvula do gate, sem relação com proteção anti-bot do app.
- **Os testes escrevem pelo produto** no banco que o app usa. Quem mantém esse banco limpo é a política de dados da
  `e2e-test-writer`, não o gate.
- **Nunca logar por teste.** O login tem limite de tentativas (20 por 15 minutos, mais o bloqueio de 5 erros por
  conta). O harness loga uma vez e reaproveita a sessão.

### Estado: optIn e ainda não provado verde

O login só existe a partir da F04. Até lá, o global setup falha com a mensagem `No valid stored session … The sign-in
flow arrives with F04`. Por isso o gate é optIn e **não conta como suíte e2e** para as skills do SDD.

A F04 completa o harness (é trabalho de gate, feito pela `gate-builder`):
1. o perfil `admin_platform` (projeto, semente e fixture de API), ao lado de `admin` e `agent`;
2. o login no global setup, pela API, com as contas de `E2E_ADMIN_PLATFORM_LOGIN`/`E2E_ADMIN_PLATFORM_PASSWORD`,
   `E2E_ADMIN_LOGIN`/`E2E_ADMIN_PASSWORD` e `E2E_AGENT_LOGIN`/`E2E_AGENT_PASSWORD`, gravando o `currentUser` no
   `localStorage` do storage state;
3. a configuração anti-bot de não produção, se a F04 tiver uma, documentada aqui;
4. as sementes conferindo o marcador da tela autenticada, e a do `agent` conferindo pela `adminApi` que as contas de
   `admin` e `agent` estão no mesmo domínio;
5. a prova falha → passa (quebrar uma semente de propósito), o registro da data aqui e a entrada do gate na cadeia
   padrão.

**Decidido em 2026-10-03:** três perfis, `admin_platform` = `platform_admin`, `admin` = `domain_admin` e
`agent` = `user`, com as variáveis acima e o diretório `tests/e2e/<perfil>/`. As senhas ficam só nos arquivos de
ambiente locais. O banco de desenvolvimento começa vazio e é só de teste. As regras da `e2e-test-writer` hoje aceitam
só `admin` e `agent`: o terceiro perfil depende de adaptá-las no repositório das skills antes da rodada da F04.

## Ainda não construído

| Gate ou peça | Quando | Por quê |
|---|---|---|
| `visual-frontend` | F04 | precisa de telas e do tema. Começa pelos defeitos que aparecerem, não por uma lista de desejos |
| Checagens estruturais do `styles-frontend` (densidade de diálogo, listagem com o filtro lateral) | quando os componentes de página existirem | não há o que medir ainda |
| Lint, typecheck e deadcode do `examples/` | F11 | a pasta ainda não existe |

## Exceções conscientes

- **`apps/backend/knip.json` e `apps/frontend/knip.json`** declaram `tools/eslint-rules/*.js` como entrada. O runner
  carrega essas regras por `rulePaths`, e o knip não enxerga isso.
- **O `.eslintrc.json` do frontend declara o `@angular-eslint/template-parser`** no override de `.html`. O preset já o
  usa, mas sem a declaração o knip acusa a dependência como não usada.
- **`coverageProvider: 'v8'`** nos quatro `jest.config.js`: o provider padrão gera caminhos `file:/C:/…` no Windows e
  quebra o relatório lcov.
- **`apps/frontend/.npmrc` com `legacy-peer-deps=true`:** o `@angular-devkit/build-angular` 19 declara o jest 29 como
  peer, e os testes rodam no jest 30.
- **Ferramentas de gate na raiz:** `dependency-cruiser`, `knip`, `picomatch` e o `typescript` que os dois primeiros
  usam para ler TS.
- **`npm audit` (2026-10-03), sem gate:**
  - **frontend, produção:** alertas altos e moderados no `@angular/{core,common,compiler,router}` ≤ 19.2.25, sem
    correção na linha 19 (a primeira versão corrigida é a 21.2.25, uma major). Parte vale só para SSR, hidratação e
    `HttpTransferCache`, que este app não usa. Os que valem para um app só no navegador: bypass de sanitização em
    binding bidirecional e em host bindings de diretivas (XSS), XSS por atributos de evento com i18n, e DoS por memória
    no `formatDate`. **Risco aceito em 2026-10-03:** o app fica na 19.2, que o PRD fixa, para manter a mesma versão
    do sistema para onde o que se aprende aqui será portado;
  - **backend, `ia`, `ia_simulator`:** produção limpa (`npm audit --omit=dev`). As dependências de desenvolvimento
    trazem o `braces` (DoS por padrões de glob muito aninhados) via jest e ts-node-dev.

## O que estes gates NÃO checam

Gate verde não significa feature verificada. O que está abaixo continua sendo responsabilidade de quem valida:

- **Comportamento interativo.** O `e2e-frontend` ainda não roda (login na F04) e, quando rodar, só vai dirigir os
  fluxos que tiverem teste. Nenhum gate aciona um filtro, um select, um toggle ou a paginação. Cada controle precisa
  ser exercitado individualmente numa execução com navegador visível, e **um resultado vazio nunca valida um filtro**:
  filtrar por um valor que não existe retorna zero linhas, funcionando ou não. Use um valor presente nos dados.
- **Conformidade visual medida.** Não há `visual-frontend`. Cor, contraste, espaçamento e densidade só são provados
  lendo valores computados num navegador, nunca pela presença de uma classe: um `!important` global pode anular a
  regra de um componente. O `styles-frontend` checa só o texto do CSS e dos templates. **Smoke de UI sempre no tema
  escuro primeiro.**
- **Templates, na cadeia padrão.** O `typecheck-frontend` não lê os templates. Só o `build-frontend` (optIn) os
  confere.
- **O `styles.scss` global e os temas `.scss`.** O stylelint só lê `.css`.
- **Regras burladas por indireção.** O `no-query-in-loop` não segue helpers (`loadOne(id)` num loop, com a consulta
  em outra função ou módulo), e o `no-knex-raw` não sabe o que um helper monta. O `check-architecture` busca texto, linha
  a linha: um `process.env` montado dinamicamente escapa.
- **Qualidade dos testes.** A cobertura mede linhas executadas, não asserções.
- **Integração além do que os testes cobrem.** Os gates de integração rodam só os testes que existem: um endpoint sem
  teste de integração passa sem ter tocado o banco. O N+1 em tempo de execução (o crescimento do número de consultas)
  é medido pelos testes de integração da `integration-test-writer`, não por um gate próprio.
- **O `.env.testing` de cada app.** Ninguém confere se a senha dele bate com a do `.env.infra`: se divergir, o gate de
  integração falha na conexão com `Access denied`, o que é um problema de ambiente, não de código.
- **Serviços externos.** O PRD proíbe que um teste chame a OpenAI ou o Google. As demos contra os provedores reais são
  manuais.
- **A infraestrutura dos próprios gates.** `scripts/`, `tests/e2e/` e as regras em `apps/frontend/tools/` não passam
  por lint. As regras de acesso a dados e de design system e a comparação de pacts têm autotestes; o runner não.
- **Segurança e dependências vulneráveis.** Não há gate de `npm audit`, headers ou validação de entrada.
- **Outros navegadores.** O e2e roda só no Chromium.

## Adicionar um gate

1. Acrescente `{ id, label, run }` (e `optIn: true`, se for o caso) ao array `GATES` em
   [scripts/runGate.mjs](scripts/runGate.mjs), na posição certa da ordem barato → caro. `run` recebe o escopo e
   devolve `true`, `false`, `'noop'` ou `'skipped'`. Para rodar por app, use `forApps` de
   [scripts/gates/code.mjs](scripts/gates/code.mjs).
2. Crie o script `gate:<id>` no `package.json` raiz.
3. Documente o gate aqui, inclusive o que ele **não** cobre, e prove falha → passa com uma violação deliberada.

## Adicionar um app

1. Crie `apps/<app>/` com `package.json`, lockfile, `.eslintrc.json`, `.prettierrc`, `jest.config.js` (com
   `coverageThreshold` e `coverageProvider: 'v8'`) e tsconfig.
2. Registre o app em [scripts/gates/scope.mjs](scripts/gates/scope.mjs) (`MONOREPO_APPS` para um app TS de servidor),
   no `lint-staged` do `package.json` raiz e nos scripts `lint:<app>`/`test:<app>`.
3. Se for de servidor, acrescente-o a `SERVER_APPS` no [scripts/check-architecture.mjs](scripts/check-architecture.mjs)
   e ao `ARCH_TS_CONFIG` em [scripts/gates/code.mjs](scripts/gates/code.mjs).

## Histórico

### 2026-10-03: rodada posterior à F01

A implementação da F01 trouxe os testes de integração, os contratos e o `./dev.sh --infra`. Esta rodada provou os dois
gates de integração contra o banco real e corrigiu uma divergência entre o código e este documento.

- **Correção:** o `integrationGate` rodava a parte de contratos em qualquer app com `__tests__/contracts`. Então o
  `tests-integration-backend` rodava o `test:contracts` do backend sem `PACT_DIR` e regravava o pact versionado em
  `contracts/pacts/`. Agora a parte de contratos só roda no app que a declara (`verifiesContracts`, só no `ia`).
- **`tests-integration-backend`, contra o `web_test` e o Redis db 3:**
  - PASS com os 10 testes da F01. Roda só o `test:integration`, e o pact versionado não é tocado (mesmo hash e mesmo
    mtime);
  - FAIL com uma asserção quebrada em `__tests__/integration/health.test.js` (1 de 10);
  - FAIL com o `DB_PASSWORD` errado no `.env.testing` (`Access denied for user 'web_app'`): o gate fala com o MySQL,
    não só abre a porta;
  - FAIL com uma migration temporária que rejeita no `up`: o `migrations:test` roda antes da suíte e a barra;
  - PASS de novo depois de restaurar os três probes. A migration temporária não deixou registro no `knex_migrations`.
- **`tests-integration-ia`, contra o `gateway_test` e o Redis db 2:**
  - PASS com as duas partes: 9 testes de integração e 4 de contrato (verificação do pact e as duas provas negativas);
  - FAIL com uma asserção quebrada em `__tests__/integration/health.test.ts`;
  - FAIL com o pact versionado alterado (o `code` do 401 trocado) e o escopo só em `contracts/pacts/`: só a parte de
    contratos rodou, e a verificação apontou a divergência;
  - PASS de novo depois de restaurar.
- **Cadeia padrão verde** sobre o repositório inteiro, com os dois gates provados.

### 2026-10-03: rodada prévia da F01

A spec da F01 pediu os gates de integração antes da implementação.

- **Criados:** `tests-integration-backend` e `tests-integration-ia`, na cadeia padrão, ainda não provados contra o banco
  real. A conferência semântica dos pacts entrou no `tests-backend`.
- **Restrição dos gates de unit:** `tests-backend` e `tests-monorepo` ficaram restritos a `__tests__/unit`.
  - A primeira versão usou `--testPathPattern`/`--testPathPatterns`. A prova mostrou que o jest combina esse filtro com
    os caminhos do `--findRelatedTests` num OU: um teste quebrado em `__tests__/integration` rodava no `tests-monorepo`.
  - A versão final filtra a lista no runner e roda com `--runTestsByPath`.
- **Cadeia padrão verde** sobre todos os apps, com os dois gates novos em no-op.
- **Autoteste da comparação de pacts:** 5 casos.
- **12 provas com arquivos temporários**, todas restauradas:
  - pasta de integração sem script → FAIL;
  - sem `.env.testing` → FAIL;
  - MySQL fora do ar → FAIL com `./dev.sh --infra`;
  - `INTEGRATION_SKIP=1` → SKIPPED;
  - `contracts/**` disparando a parte de contratos do `ia` → FAIL por falta de script;
  - pact do backend versionado sem testes consumidores → FAIL;
  - teste quebrado em `__tests__/integration` ignorado pelo `tests-monorepo` e pelo `tests-backend` → PASS;
  - teste quebrado em `__tests__/unit` → FAIL;
  - mudança no `jest.config.js` do `ia` rodando só a suíte de unit → PASS;
  - cobertura de 44% → FAIL;
  - spec quebrado no frontend, que não tem o filtro → FAIL.
- **`e2e-frontend`:** a mensagem de app fora do ar passou a mandar para o `./dev.sh`.

### 2026-10-03: apps independentes

Os gates foram reconstruídos para o layout de apps independentes. O plano dessa rodada fica no material privado do
projeto, porque compara os gates com os de outro sistema.

- **Cadeia padrão verde nos quatro esqueletos:** 15 gates PASS. Os testes ficaram com 100% de cobertura (5 testes no
  total). Autotestes: 41 casos nas regras de acesso a dados e 17 nas de design system.
- **`build-frontend`:** verde no esqueleto. Falhou com `{{ missingProperty }}` num template; o template foi restaurado.
- **22 violações deliberadas, todas barradas pela regra certa e depois apagadas:**
  - erro de tipo no frontend e no `ia`;
  - `no-var` e um warning de `prefer-const` no backend (o warning sozinho já falha);
  - SQL interpolado e um `eslint-disable` que não silenciou o `no-knex-raw`;
  - consulta num `for…of`;
  - `no-var` no frontend e um warning de `prefer-const` no `ia_simulator`;
  - cor hex num `.css`, `<mat-paginator>` e um `.component.scss`;
  - erro de sintaxe no Babel e erro de tipo no `tsc` do build;
  - import do backend dentro do `ia`, `process.env` num service, `.listen(` fora do `index` e model importando
    controller;
  - fonte sem teste, cobertura de 44% e um spec falhando;
  - arquivo sem uso para o knip.
- **`e2e-frontend`:** com o app fora do ar, falha com as instruções. Com `E2E_SKIP=1`, mostra o banner e fica
  `SKIPPED`. Com frontend e backend no ar, o Playwright carrega os projetos `admin` e `agent` e para no global setup
  com a mensagem da F04. Ainda não provado verde.

### Antes de 2026-10-03

Os gates anteriores (`typecheck`, `lint`, `build`, `arch`, `tests`, `deadcode`, `e2e`) foram feitos para o layout de
npm workspaces e estão no histórico do Git até o commit `9796d54`. Os planos deles ficam em
`docs/architecture/gate-plan-2026-09-23.md` e `docs/architecture/gate-plan-e2e-2026-10-03.md`.
