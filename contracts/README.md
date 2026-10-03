# Contratos entre o backend e o proxy

O backend descreve, em testes de contrato, o que espera de cada endpoint do proxy que usa: status, códigos de erro,
headers e campos de request e response. O proxy verifica esses contratos contra o app real. O mecanismo é o
[Pact](https://docs.pact.io/) (v15, DSL `PactV3`), no modelo orientado pelo consumidor.

Esta pasta é a única que os dois apps leem fora do próprio diretório. Nenhum deles importa código daqui: os pacts são
arquivos JSON, lidos e escritos pelos testes.

## Quem faz o quê

| Papel | App | Onde | Script |
|---|---|---|---|
| Consumidor: gera os pacts | `apps/backend` (`ai-gateway-backend`) | `__tests__/contracts/*.contract.test.js` | `npm run test:contracts` |
| Provedor: verifica os pacts | `apps/ia` (`ai-gateway-ia`) | `__tests__/contracts/backend.provider.test.ts` | `npm run test:contracts` |

- **Consumidor.** Cada teste descreve uma interação e a exercita pelo cliente real do backend
  (`createIaGatewayClient`), contra o mock server do Pact. O resultado vai para
  `contracts/pacts/ai-gateway-backend-ai-gateway-ia.json`.
- **Provedor.** O teste sobe o app do proxy numa porta efêmera e roda o `Verifier` sobre todos os pacts desta pasta
  cujo provedor é `ai-gateway-ia`. Um segundo teste prova que a verificação falha quando a resposta do proxy muda (o
  `code` do 401 trocado, o `x-request-id` removido).

## Gates

- **`tests-backend`** roda o `test:contracts` do backend inteiro com `PACT_DIR` numa pasta temporária e compara o
  resultado com os pacts versionados, interação por interação. Falha se uma interação mudar, aparecer ou sumir sem que
  o pact versionado acompanhe. O gate nunca escreve aqui.
- **`tests-integration-ia`** roda a verificação do provedor sempre que muda algo no `apps/ia` ou nesta pasta.

As regras completas estão no [GATES.md](../GATES.md).

## Acrescentar uma interação

Toda feature que passa a usar um endpoint do proxy acrescenta o contrato dele:

1. Crie `apps/backend/__tests__/contracts/<recurso>.contract.test.js`, no molde de `ia-admin-auth.contract.test.js`:
   `PactV3` com `consumer` e `dir` vindos de `__tests__/utils/reset-pacts.js`, uma descrição única por interação, e o
   cliente do backend dentro do `executeTest`.
2. Use matchers (`like`, `eachLike`, `regex`) para o que pode variar, e valores literais para o que o backend usa ao
   pé da letra (status, `code`, `type`, headers). O FFI do Pact não aceita matcher no `Content-Type`.
3. Se a interação precisa de dados no proxy, declare um provider state (`given(...)`) e implemente o handler dele no
   teste do provedor.
4. Regenere e versione o pact (abaixo), e rode `npm run test:contracts` no `apps/ia`.

## Regenerar

```bash
cd apps/backend && npm run test:contracts
```

O script primeiro roda `__tests__/utils/reset-pacts.js`, que apaga os pacts do backend em `PACT_DIR` (padrão
`contracts/pacts`). Isso é necessário porque a `PactV3` mescla as interações novas com as do arquivo existente: sem a
limpeza, uma interação removida de um teste continuaria no pact. Depois, a suíte inteira roda em série
(`--runInBand`), e as interações de todos os arquivos consumidores se somam no mesmo pact. Rodar só um arquivo de
contrato gera um pact parcial.

O pact regenerado entra no mesmo commit da mudança que o motivou.
