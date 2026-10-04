# F02 — Checklist dos testes unitários

Gerado com as regras da skill `monorepo-unit-test-writer` (stack `node-express`), em modo autônomo, durante o
`implement-feature` da F02. O código dos testes é em inglês.

## `apps/ia/__tests__/unit/`

### `config/catalog.test.ts` → `src/config/catalog.ts`
Mocks: `loader` (o teste não lê o `.env.testing` local) e `fs.readFileSync` (os catálogos vêm da memória; o catálogo
versionado passa pelo `fs` real). O ambiente é montado à mão em cada teste.
- [x] o catálogo versionado é válido com chaves fictícias, e tem as três capacidades do PRD (sem fixar modelos nem preços)
- [x] lê o `CATALOG_FILE` relativo ao diretório de trabalho; sem ele, `catalog/catalog.json`; sem argumento, usa o
      `process.env`
- [x] arquivo ilegível e JSON inválido; cada problema prefixado com `Invalid catalog:` na mensagem do `CatalogError`
- [x] fallback e primário inexistentes, citando a capacidade e o deployment; capacidade sem fallback (`null` ou ausente)
- [x] nomes de capacidade fora do kebab-case ou da faixa de 3 a 40, com o limite de 40 aceito
- [x] nomes genéricos (`modelo-1`, `chat-2`, `ai-model`, `default-test`) e com provedor (`gpt4-helper`,
      `gemini-classifier`, `ticket-openai`, `claude-writer`); os três nomes do PRD aceitos
- [x] nome de deployment fora do kebab-case ou da faixa de 3 a 60
- [x] duplicidades, fallback igual ao primário, mapeamento fora dos `params` e `params` sem `max_tokens`
- [x] faixas de `max_tokens`, `timeout_seconds` e `max_retries`, inteiro, tipo `chat`, booleano; limites aceitos
- [x] preço negativo e acima de 1.000; chaves desconhecidas; `fixed_params` desconhecido e `reasoning_effort` inválido
- [x] `params` fora da lista e repetidos; provedor desconhecido; modelo com caractere inválido
- [x] contrato de resposta: formato, tipo dos valores permitidos, campos repetidos, tipo de campo inválido
- [x] catálogo que não é objeto; listas vazias ou ausentes
- [x] credencial ausente ou vazia, sem imprimir valores; `credential_env` fora do formato sem ecoar o valor;
      `simulated` sem credencial aceito; `openai`/`gemini` sem credencial recusados
- [x] itens sem nome, com nome que não é texto, que não são objetos, e `params`/`param_mappings` do tipo errado
- Cobertura do `src/config/catalog.ts`: 100% em linhas, funções e branches

### `config/env.test.ts` → `src/config/env.ts` (acréscimos da F02)
- [x] `CATALOG_FILE` aceito na validação
- [x] `catalogFile()` devolve o padrão sem a variável e com ela vazia, o valor quando definida, e lê o `process.env` na
      chamada
