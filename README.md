# Arquitetura de IA

Aplicação MVC com Node.js, TypeScript, Express e EJS. Testes com Jest.

## Requisitos

- Node.js 20+

## Como rodar

```bash
npm install
cp .env.example .env
npm run dev        # desenvolvimento com hot reload (tsx)
npm run build      # compila para dist/
npm start          # executa a versão compilada
npm test           # testes (Jest + Supertest)
```

## Estrutura

```
src/
  app.ts                 # configuração do Express (views, middlewares, rotas)
  server.ts              # ponto de entrada (sobe o servidor)
  config/env.ts          # variáveis de ambiente
  models/                # M — dados e regras de acesso
  controllers/           # C — recebem a requisição e escolhem a view
  routes/                # mapeamento URL -> controller
  middlewares/           # 404 e tratamento de erros
views/                   # V — templates EJS (partials, páginas)
public/                  # arquivos estáticos (CSS, imagens, JS do cliente)
tests/                   # testes Jest
```
