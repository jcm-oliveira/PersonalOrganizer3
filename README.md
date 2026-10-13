# Novo

Aplicação web Node.js + Express + EJS + MySQL. É a mesma stack do projeto de referência, descrita em [docs/ARQUITETURA.md](docs/ARQUITETURA.md), já com as correções propostas na seção 13 daquele documento.

## Requisitos

- Node.js 20.17 ou superior. A imagem Docker usa o Node 22 LTS.
- MySQL 8. Pode ser local ou subir pelo `docker compose`.

## Primeiros passos

```bash
cp .env.example .env      # ajuste DATABASE_URL e as senhas
npm install
npm run db:migrate        # cria as tabelas de sql/migrations/
npm run dev               # http://localhost:3000, recarrega ao salvar
```

Com Docker:

```bash
cp .env.example .env
docker compose up -d --build
docker compose run --rm app npm run db:migrate
```

## Scripts

| Script                            | O que faz                                                         |
| --------------------------------- | ----------------------------------------------------------------- |
| `npm start`                       | Sobe o servidor                                                   |
| `npm run dev`                     | Sobe o servidor com `node --watch`                                |
| `npm run db:migrate`              | Aplica as migrações pendentes de `sql/migrations/`                |
| `npm run lint`                    | ESLint                                                            |
| `npm run format` / `format:check` | Prettier: formata / só verifica                                   |
| `npm test`                        | Testes (`node:test` + `supertest`, sem banco)                     |
| `npm run check`                   | Lint, formatação e testes, nessa ordem. Use antes de abrir um PR. |

Não há etapa de build: o Node executa o código direto, e o front usa Bootstrap 4.3.1 por CDN, como no projeto de referência.

## Estrutura

```
src/
├── server.js            # sobe o HTTP e faz o encerramento gracioso
├── app.js               # monta o Express (helmet, estáticos, parsers, rotas, erros); usado pelos testes
├── routes.js            # agrega as rotas do portal e dos módulos
├── routes/              # um router por módulo (activityRoutes.js)
├── controllers/         # <Entidade>Controller.js: HTTP, validação e escolha da view
├── model/               # <Entidade>Model.js: SQL parametrizado, devolve dados ou lança erro
├── validation/          # schemas zod de formulário e de filtros
├── middlewares/         # 404 e tratamento central de erros
├── errors/              # HttpError
├── config/env.js        # variáveis de ambiente validadas (o app não sobe se faltar alguma)
├── db/config.js         # pool mysql2 + withTransaction()
└── views/               # EJS: parts/, cms/, errors/
public/                  # único diretório servido como estático
sql/migrations/          # NNN_descricao.sql, aplicados em ordem
scripts/migrate.js       # runner de migrações (tabela schema_migrations)
test/                    # *.test.js
```

## Módulo de Atividades (`Activity`)

Implementado cobrindo inserção, edição, visualização e exclusão com indicadores de farol de vencimento, e visão geral de status das atividades no Dashboard:

| Rota                                                   | Controller           | View                                   |
| ------------------------------------------------------ | -------------------- | -------------------------------------- |
| `GET /cms-Activity-Q?status=&search=&trafficLight=...` | `loadShowPage`       | `cms-Activity-Q` (+ modal `-F`)        |
| `GET /cms-Activity-C`                                  | `loadInsertPage`     | `cms-Activity-C` (+ campos `-I`)       |
| `POST /cms-Activity-C`                                 | `insertActivityPage` | redirect 303 → lista                   |
| `GET /cms-Activity-C/:id`                              | `loadUpdatePage`     | `cms-Activity-U` (+ `-I`, modal `-D`)  |
| `GET /cms-Activity-V/:id`                              | `loadViewPage`       | `cms-Activity-V` (detalhes/visualizar) |
| `POST /cms-Activity-U/:id`                             | `updateActivityPage` | redirect 303 → lista                   |
| `POST /cms-Activity-D/:id`                             | `deleteActivityPage` | redirect 303 → lista                   |

### Diferenças em relação ao projeto de referência

- **Filtro e paginação** usam `GET` com query string. Saem os POSTs `-Q`/`-F` com campos ocultos.
- **Depois de gravar**, o controller redireciona (padrão PRG) com `?msg=created|updated|deleted`. O texto da mensagem fica no controller, não no model.
- **Validação no servidor** com zod. Um formulário inválido volta com status 422 e as mensagens ao lado de cada campo.
- **Erros** chegam ao middleware central. O Express 5 já repassa as promises rejeitadas, então não há `try/catch` repetido nos controllers.
- **Filtro de status** usa `status = ?` em vez de `LIKE '%'`, o que preserva o uso dos índices.
- **Views** compartilham `parts/head` e `parts/footer`, em vez de repetir o `<head>` em cada página. Dados sempre saem com `<%= %>`.

## Pendências

- **Autenticação do CMS, CSRF e limite de tentativas de login** (ARQUITETURA.md, seção 13.2) ainda não foram implementados. Até lá, as rotas `/cms-*` ficam abertas e **não devem ser expostas em produção**.
- **Upload de arquivos** (multer com `limits` e `fileFilter`) entra junto com o primeiro módulo que precisar dele.
- **Bootstrap 4** está sem suporte desde 2023. Foi mantido por compatibilidade visual com o projeto de referência; avaliar a migração para o Bootstrap 5.
