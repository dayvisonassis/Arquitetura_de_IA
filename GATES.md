# Quality Gates

Checagens determinísticas de passa/falha que protegem o projeto. Os `id`s abaixo são os mesmos que o
`spec-writer` declara no `contract.md` de cada feature e que o `implement-feature` e o `evaluator` executam.

## Como rodar

```bash
npm run gate                        # todos, em ordem, parando na primeira falha
npm run gate:lint                   # um gate isolado
node scripts/runGate.mjs lint arch  # um subconjunto (sempre na ordem do registro)
```

Código de saída: `0` = tudo passou · `1` = algum gate falhou · `2` = id de gate desconhecido.

## Gates

A ordem vai do mais barato ao mais caro: `typecheck → lint → build → arch → tests → deadcode`.

| id | O que garante | Comando | Configuração |
|---|---|---|---|
| `typecheck` | Contrato de tipos (strict) | `tsc --noEmit` | `tsconfig.json` |
| `lint` | Consistência, **zero warnings** | `eslint . --max-warnings=0` | `eslint.config.mjs` (typescript-eslint `recommendedTypeChecked`) |
| `build` | O projeto compila para `dist/` | `tsc -p tsconfig.build.json` | `tsconfig.build.json` |
| `arch` | Fronteiras das camadas MVC | `depcruise src` + `node scripts/check-architecture.mjs` | `.dependency-cruiser.cjs`, `scripts/check-architecture.mjs` |
| `tests` | Comportamento + cobertura mínima de 80% | `jest --coverage` | `jest.config.js` (`coverageThreshold`, provider `v8`) |
| `deadcode` | Arquivos, exports e dependências sem uso | `knip` | `knip.json` |

### Regras do `arch`

| Regra | Onde é aplicada | Significado |
|---|---|---|
| `no-circular` | dependency-cruiser | nenhum ciclo de import |
| `models-are-pure` | dependency-cruiser | `src/models/` não importa controllers, routes, middlewares, `app`/`server` nem `express` |
| `controllers-not-routes` | dependency-cruiser | `src/controllers/` não importa `routes/` nem `app`/`server` |
| `routes-only-wire` | dependency-cruiser | `src/routes/` não importa `models/`; a rota só liga URL → controller |
| `not-to-tests` | dependency-cruiser | `src/` nunca importa `tests/` |
| `no-orphans` | dependency-cruiser | todo módulo de `src/` precisa ser alcançável a partir de `src/server.ts` |
| `env-only-in-config` | check-architecture | `process.env` só em `src/config/env.ts` |
| `listen-only-in-server` | check-architecture | `.listen(` só em `src/server.ts`, para que o `app.ts` continue testável |

### Exceções conscientes

- `knip.json` → `ignoreDependencies: ["ejs"]`: o EJS é carregado pelo Express via `app.set('view engine', 'ejs')`,
  não por `import`, então o knip não o enxerga.
- `knip.json` → `ignoreExportsUsedInFile: true`: um tipo exportado e usado no próprio arquivo não conta como código morto.
- `jest.config.js` → `coverageProvider: 'v8'`: o provider padrão (babel/istanbul) gera caminhos `file:/C:/...` no Windows e quebra o relatório lcov.

## Adicionar um gate

1. Acrescente `{ id, label, run }` ao array `GATES` em [scripts/runGate.mjs](scripts/runGate.mjs), na posição certa da ordem barato → caro.
2. Crie o script `gate:<id>` no `package.json`.
3. Documente o gate nesta página, inclusive o que ele **não** cobre.

## O que estes gates NÃO checam

Gate verde não significa feature verificada. O que está abaixo continua sendo responsabilidade de quem valida:

- **Comportamento interativo.** Nenhum gate preenche formulário, clica em link ou navega entre páginas.
  Os testes Supertest checam status e HTML do servidor, não o que o navegador faz. Cada controle precisa ser
  exercitado individualmente numa execução com navegador visível. **Resultado vazio nunca valida um filtro ou uma
  busca**: uma busca por um valor inexistente retorna zero linhas funcionando ou não, então teste com um valor que existe nos dados.
- **Conformidade visual.** Não existe gate `design-system` (o projeto não tem documento de design system) nem
  `visual-contract`. Layout, contraste, espaçamento e responsividade não são verificados.
- **Qualidade dos testes.** A cobertura de 80% mede linhas executadas, não asserções. Um teste que executa o
  caminho sem checar o resultado passa no gate.
- **Serviços externos.** O model atual é em memória. Quando houver banco de dados, credenciais reais ou APIs de
  terceiros, eles não serão exercitados pelos gates até existir um gate de integração dedicado.
- **Regras de arquitetura por regex.** O `check-architecture` busca texto, linha a linha, e ignora só comentários `//`.
  Um `process.env` montado dinamicamente (`process['env']`) ou dentro de `/* */` escapa da regra.
- **Segurança e dependências vulneráveis.** Não há gate de `npm audit`, headers, CSRF ou validação de entrada.

## Estado inicial (2026-09-23)

- Todos os gates passam (`npm run gate` verde, 10 testes, 100% de linhas e 90,9% de branches).
- Na primeira execução, o `lint` apontou 7 erros no esqueleto, que foram corrigidos no código:
  - `no-unsafe-assignment`: o `req.body` agora é tratado como `unknown` e validado em `parseCreateUser`.
  - `unbound-method`: os handlers dos controllers passaram a ser arrow functions.
