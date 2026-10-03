# Regras do Projeto

O AI Gateway é o trabalho do MBA em Arquitetura de IA e também um laboratório: segue a stack e as convenções do
sistema de produção para onde as tecnologias testadas aqui serão levadas. Por isso, tudo o que se aprende aqui
precisa poder ser portado sem tradução. O produto está descrito no [PRD](docs/prd/ai-gateway-prd.md), que é a
fonte da verdade das regras de produto.

## Estrutura

- **Apps independentes em `apps/`, sem npm workspaces.** Cada app tem o próprio `package.json`, lockfile,
  `.eslintrc.json`, `.prettierrc` e configuração de testes, e é instalado com `npm ci` dentro da pasta dele:
  - `apps/frontend`: Angular 19.2 com Angular Material 19, componentes standalone, prefixo de seletor `tails`, Jest
    com `jest-preset-angular`, porta 4200;
  - `apps/backend`: Express 4 em JavaScript transpilado pelo Babel, API `/v2`, Jest e Supertest, porta 3030;
  - `apps/ia`: o proxy de IA, Express 4 em TypeScript, Jest com `ts-jest`, porta 3131;
  - `apps/ia_simulator`: o destino simulado, no mesmo molde do `apps/ia`, só na rede interna.
- **Nenhum app importa código de outro.** O frontend fala só com o backend, e só o backend fala com o proxy,
  sempre por HTTP.
- **A raiz só tem as ferramentas comuns** (Husky, lint-staged, Prettier, Playwright) e scripts no formato
  `cd apps/<app> && ...`.
- **Node 22.13.0**, fixado no `.nvmrc`.
- O `apps/frontend` tem um `.npmrc` com `legacy-peer-deps=true`: o `@angular-devkit/build-angular` 19 ainda declara
  o jest 29 como peer, e os testes rodam no jest 30. Copie o `.npmrc` junto com o `package.json` em qualquer
  Dockerfile ou pipeline que rode `npm ci` no frontend.

## Comentários no código

- **Nenhum comentário em código de produção.** O código deve se explicar sozinho.
- Comentários só nos testes, e sempre em inglês. Nomes de teste (`describe`/`it`) também em inglês.
- A documentação (`docs/`, `README.md`, este arquivo) é escrita em português.

## Controle de versão

- O branch de integração é o `main`.
- **Mensagens de commit em inglês** (assunto e corpo), com o prefixo `Feat:`/`Fix:`/`Refactor:`/`Test:`/`Docs:`/
  `Perf:`/`Chore:`, assunto curto, corpo explicando o **porquê** e as decisões não óbvias, sem acentos. Os commits
  anteriores a esta regra estão em português e não devem ser reescritos.
- **Mudanças no PRD ou numa spec** passam por uma revisão independente, repetida até sair "APROVADO", antes do commit.

## Formatação (Prettier)

- **Versão única e exata: `3.8.3`**, sem `^`, na raiz e em todos os apps. Com `^`, cada `npm install` pode resolver
  uma versão diferente por pasta, e a mesma alteração sai formatada de dois jeitos.
- A configuração é a mesma em todos os apps (`.prettierrc`: `semi: false`, `singleQuote`, `trailingComma: none`,
  `printWidth: 80`, `arrowParens: avoid`).
- **Formate a partir da raiz, só os arquivos que você alterou**, passando a configuração do app:
  `npx prettier --write --config apps/<app>/.prettierrc <arquivos>`. Nunca formate uma pasta inteira.
- O `pre-commit` roda o `lint-staged`, que aplica `eslint --fix` (com o ESLint do próprio app) e o Prettier nos
  arquivos em staged. O `pre-push` roda o lint de todos os apps, sem bloquear.

## Testes e quality gates

- Os gates rodam sempre da raiz, com `npm run gate`. A lista de gates e o comportamento de cada um ficam no
  [GATES.md](GATES.md).
- Nenhum teste chama um provedor de IA real (OpenAI ou Google); os testes usam o `apps/ia_simulator` ou mocks.
- As skills de teste do fluxo SDD pressupõem este layout: `apps/frontend/src/**/*.spec.ts`,
  `apps/backend/__tests__/{unit,integration}`, `apps/<app>/__tests__/unit` nos apps em TypeScript e `tests/e2e/` na
  raiz.

## Smoke tests de UI

- **Sempre validar no tema escuro primeiro**, e só depois no claro. Ao terminar, não deixe a tela parada no tema claro.

## Skills do fluxo SDD

- As skills de `.claude/skills/` são uma cópia da pasta `skills/` do repositório
  [sdd-skills](https://github.com/dayvisonassis/sdd-skills). **Nenhuma skill é criada ou editada direto aqui**: a
  mudança nasce no repositório das skills e depois é copiada para cá.

## Segredos e material interno

- Cada app de servidor lê as variáveis de `apps/<app>/.env.<ambiente>`, que fica fora do Git. Os modelos versionados
  ficam em `apps/<app>/config/.env.<ambiente>.example`, só com os nomes das variáveis.
- Nunca escreva chaves, senhas, hosts internos ou IPs em arquivos versionados.
- Material que descreve o sistema de produção fica em `docs/private/`, que o Git ignora.

## Ambiente local Windows

- O Bash daqui é o Git Bash: `/tmp` não é o mesmo diretório para o Bash e para o Node.
- `spawnSync(..., { shell: true })` usa o `cmd.exe`, que não expande globs: passe caminhos explícitos.
- Exclusões (`rm -rf`) costumam ser bloqueadas no modo automático: peça autorização antes e não junte a exclusão
  com outra etapa.
