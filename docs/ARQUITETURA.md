# Arquitetura do projeto de referência (`../referencia`)

Análise do projeto **TheoMe** (`package.json` → `"name": "theome"`), feita para servir de base ao projeto `novo`. O documento descreve o que existe hoje, sem propor código. A seção 12 lista os pontos de atenção encontrados, e a seção 13 propõe como o `novo` deve tratá-los.

Último commit analisado: `189c0f1 ultimos ajustes menus` (20/07/2026).

---

## 1. Visão geral

Aplicação web monolítica com renderização no servidor (SSR) e duas áreas:

- **Portal público**: home com carrossel de banners, além das áreas Ferramentas (Bíblia, linha do tempo), Biblioteca, Cristianismo, Comunidade e Sobre. A maior parte dessas páginas é estática.
- **CMS** (prefixo `cms-`): cadastros administrativos (CRUD) para a geografia, a taxonomia de conteúdo, as linhas do tempo, os atributos, os banners e o **Item de Estudo**, que é a entidade central.

```
Navegador ──HTTP──▶ Express (src/server.js)
                      │
                      ├─ express.static("public")  → CSS, imagens, JS do front, uploads
                      ├─ express.static("src")     → (expõe o código-fonte; ver seção 12)
                      └─ routes.js ──▶ Controller ──▶ Model (SQL puro) ──▶ MySQL
                                          │
                                          └─▶ res.render(EJS) | res.json | res.redirect
```

## 2. Linguagem e versões

| Item | Valor |
|---|---|
| Linguagem | JavaScript (ES2017+, `async/await`) |
| Módulos (backend) | CommonJS (`require` / `module.exports`) |
| Módulos (front) | ES Modules nativos do navegador (`import {Period} from '../scripts/database.js'`), mais scripts globais |
| Runtime | Node.js. Não há campo `engines` nem `.nvmrc`. Na máquina de análise: **v20.17.0** |
| Banco de dados | MySQL (InnoDB, `utf8mb4` / `utf8mb4_unicode_ci`) |
| Gerenciador de pacotes | npm (`package-lock.json`, `lockfileVersion: 2` → npm 7+) |
| Idioma da UI | Português (`lang="pt-br"`); o código usa identificadores em inglês |

## 3. Frameworks e bibliotecas

### Backend (`package.json`)

| Pacote | Declarado | Instalado | Uso real |
|---|---|---|---|
| `express` | ^4.18.2 | 4.18.2 | Servidor HTTP, roteamento e arquivos estáticos |
| `ejs` | ^3.1.10 | 3.1.10 | Template engine das views |
| `mysql2` | ^2.3.3 | 2.3.3 | Driver em uso, pela API `mysql2/promise` |
| `multer` | ^1.4.5-lts.1 | 1.4.5-lts.2 | Upload de imagens (banners e imagens de atributos) |
| `mysql` | github:mysqljs/mysql | 2.18.1 | **Não utilizado** |
| `pg` | ^8.11.0 | 8.11.0 | **Não utilizado** (PostgreSQL) |
| `bootstrap` | ^5.2.3 | 5.3.0 | **Não utilizado**: as views carregam o Bootstrap 4 por CDN |
| `nodemon` (dev) | ^2.0.20 | 2.0.22 | Hot reload no `npm run dev` |

Não há ORM, query builder, validador, logger, biblioteca de autenticação nem dotenv.

### Front-end (via CDN, nas `<head>` de cada view)

- Bootstrap **4.3.1** (CSS + JS), jQuery **3.3.1 slim** e Popper.js **1.14.7**
- Font Awesome **5.11.2**
- Google Fonts: *IBM Plex Sans* e *Inter*
- JavaScript puro (sem framework) para os combos em cascata, via `fetch` com resposta em JSON
- CSS próprio em `public/styles`, organizado por componente (`parts/`) e por página (`pages/`)

## 4. Estrutura de pastas

```
referencia/
├── package.json / package-lock.json
├── .dccache                 # cache do Snyk/DeepCode (artefato local; não versionar)
├── scripts/                 # vazio
├── sql/                     # DDL avulsos, um arquivo por tabela, mais scripts de migração
├── public/                  # servido como estático na raiz "/"
│   ├── images/              # logos, fotos e imagens do carrossel
│   ├── scripts/             # JS do navegador (timeline, formulários do CMS, mock de dados)
│   ├── styles/
│   │   ├── parts/           # header, navbar, footer, form, modal, grid, cards...
│   │   ├── pages/           # index, cms/, tools/
│   │   ├── about/ community/
│   └── uploads/             # arquivos enviados pelo multer (sem .gitignore)
│       ├── banners/
│       └── study-item-attributes/
└── src/
    ├── server.js            # bootstrap do Express
    ├── routes.js            # TODAS as rotas, configuração do multer e um mock "Period"
    ├── db/
    │   ├── config.js        # conexão MySQL (singleton em global.connection)
    │   └── init.js          # script de criação do banco (quebrado; ver seção 12)
    ├── controllers/         # 15 controllers, um por entidade
    ├── model/               # 15 models (acesso a dados com SQL), um por entidade
    └── views/               # EJS
        ├── index.ejs
        ├── parts/           # parciais: header, navbar, footer, menu, slider, cards...
        ├── cms/             # telas do CMS (padrão de sufixos; ver seção 7)
        ├── tools/ library/ christianity/ community/ about/
```

## 5. Camadas e padrões

A arquitetura é **MVC em duas camadas de backend**: Controller + Model. **Não existe camada de Service nem de Repository.** O Model faz o papel de repositório (SQL), e a regra de negócio fica espalhada entre controller e model.

### 5.1 Rotas (`src/routes.js`)
- Um único `express.Router()` concentra as cerca de 150 rotas do portal e do CMS.
- Rotas sem lógica renderizam a view direto com `(req,res) => res.render(views + "...")`.
- Rotas de CRUD apontam para métodos do controller.
- Só `GET` e `POST`. Update e delete também usam `POST` (`/cms-X-U/:id`, `/cms-X-D/:id`), porque os formulários HTML não enviam `PUT`/`DELETE`.
- Os uploads usam `multer.diskStorage`, configurado dentro de `routes.js` e aplicado como middleware por rota (`upload.single('bannerImage')`).
- Rotas legadas viram `res.redirect` (ex.: `/cms-Period-Q` → `/cms-Attribute-Q`).

### 5.2 Controllers (`src/controllers/<Entidade>Controller.js`)
Cada controller exporta um objeto literal de métodos `async (req, res)`. O ciclo de cada tela é fixo:

| Método | Rota | Responsabilidade |
|---|---|---|
| `loadShowPage` | `GET /cms-X-Q` | Lista inicial (status=1, 10 por página) |
| `paginationView` | `POST /cms-X-Q` | Página anterior/próxima (estado em campos ocultos do form) |
| `filterXPage` | `POST /cms-X-F` | Aplica o filtro do modal |
| `loadInsertPage` | `GET /cms-X-C` | Formulário vazio mais combos |
| `insertXPage` | `POST /cms-X-C` | Insere e re-renderiza a lista com mensagem |
| `loadUpdatePage` | `GET /cms-X-C/:id` | Formulário preenchido (view `-U`) |
| `updateXPage` | `POST /cms-X-U/:id` | Atualiza e re-renderiza a lista |
| `deleteXPage` | `POST /cms-X-D/:id` | Exclusão lógica e re-renderiza a lista |
| `<pai>Listener` | `POST /cms-X-X-<Pai>` | Devolve JSON para combo em cascata (ex.: país → regiões) |

Características:
- O estado da listagem viaja num objeto **`filterStatus`** (`status`, `search`, `currentPage`, `itemsPerPage`, `pageStartItem` e filtros por FK), recriado em cada método. Por isso há muita duplicação.
- "Todos" é representado pelo curinga SQL `'%'`: status `2` vira `%`, combos com valor `"0"` viram `%` e busca vazia vira `%`.
- Mensagens para a view seguem o formato `messages = { display, alertType, textMessage }`, onde `display` é `"d-none"` ou `""` e `alertType` é uma classe do Bootstrap (`alert-success`, `alert-danger`, `alert-warning`).
- Depois de insert, update e delete, o controller **renderiza** a lista em vez de redirecionar (sem PRG). Exceção: `StudyItemController` usa `res.redirect` e aceita `submitAction === "saveNew"`.
- O mapeamento de `req.body` para o objeto do model é manual (ex.: `req.body.cityName` → `{ cityName }`).

### 5.3 Models (`src/model/<Entidade>Model.js`)
- Exportam **funções soltas** (não classes).
- Cada função obtém a conexão com `await db.connect()` e executa SQL parametrizado com `?` via `conn.query(sql, values)`.
- Os SELECTs devolvem a tupla do `mysql2` `[rows, fields]`, e o controller desestrutura: `const [cities] = await City.selectCities(...)`.
- Os INSERT, UPDATE e DELETE devolvem `{ alertTypeResult, textResult }` com o texto pronto para o usuário. O model conhece a apresentação.
- Os filtros usam `LIKE ?` inclusive em colunas numéricas (`status LIKE ?`, `id_state LIKE ?`) para aceitar `%`.
- Paginação com `LIMIT ? OFFSET ?`, mais uma função `countSelect` separada para o total.
- Nomes de funções: `selectXs`, `countSelect`, `insertXs`, `updateXs`, `deleteXs`, `filterSelect<Pai>s` (combos) e `get<Filhos>By<Pai>` (cascata).
- **Transações** aparecem só em `StudyItemModel` (`beginTransaction` / `commit` / `rollback` com `throw`), porque o item é gravado junto com cinco coleções filhas.
- `StudyItemModel` também checa o `information_schema` em tempo de execução para tolerar tabela ou coluna ausente (`book`, `book.canonical_order`).

### 5.4 Views (EJS)
- Cada view é uma **página HTML completa**, com `<head>` próprio (CDNs repetidos em cerca de 140 arquivos), e inclui parciais com `<%- include('../parts/header') %>`.
- Os modais de filtro (`-F`) e de exclusão (`-D`) são views EJS incluídas dentro da lista (`-Q`) ou do formulário de edição (`-U`).
- A paginação é feita com dois `<form method="post">` que carregam o `filterStatus` em inputs ocultos.
- As cascatas de combos usam `<script>` inline com `fetch("/cms-X-X-<Pai>", { method: "POST", body: JSON })`.
- O formulário do Item de Estudo (cerca de 1.650 linhas) monta as coleções filhas no cliente e as envia serializadas em campos ocultos `*ItemsJson`.
- Há uso misto de `<%-` (sem escape) e `<%=` (com escape) para dados do banco.

### 5.5 Banco/conexão (`src/db/config.js`)
- **Uma única conexão** (`mysql2/promise.createConnection`) é guardada em `global.connection` e reaproveitada. Não há pool.
- A conexão é aberta na carga do módulo (`connect()` no topo).

## 6. Modelagem de entidades

### 6.1 Convenções de tabela (vale para todas as que têm DDL)
- `id INT UNSIGNED AUTO_INCREMENT` como PK
- Nome da tabela em `snake_case` no **singular** (`study_item`, `category_level_1`)
- FK nomeada `id_<tabela_referenciada>` (prefixo `id_`, não sufixo `_id`)
- Colunas padrão: `name VARCHAR(150)`, `description TEXT NULL`, `status TINYINT(1) DEFAULT 1` (ativo/inativo) e `excluded TINYINT(1) DEFAULT 0` (**soft delete**)
- Auditoria: `created_at` e `updated_at` (`ON UPDATE CURRENT_TIMESTAMP`)
- Índices `idx_<tabela>_<coluna>`, constraints `fk_<tabela>_<referência>`, normalmente com `ON UPDATE CASCADE ON DELETE RESTRICT`. As tabelas filhas do item de estudo usam `ON DELETE CASCADE`.
- `ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`

### 6.2 Domínios

**Geografia** (hierarquia linear; sem DDL em `sql/`, estrutura inferida dos models):
```
continent ─< country ─< region ─< state ─< city
            (id_continent) (id_country) (id_region) (id_state)
```
Colunas usadas: `id, name, description, status, excluded` mais a FK do pai.

**Taxonomia de conteúdo** (todas as tabelas ligadas a uma *perspectiva histórica*):
```
historical_perspective
   ├─< category_level_1 (id_historical_perspective)
   │      └─< category_level_2 (id_historical_perspective, id_category_level_1)
   │             └─< category_level_3 (id_historical_perspective, id_category_level_2)
   │                    └─< section (id_historical_perspective, id_category_level_3)
   └─< timeline (visualization, background_color, icon)
```
A FK `id_historical_perspective` é **desnormalizada** e se repete em todos os níveis.

**Atributos**: `attribute_type ─< attribute` (ambos com `image VARCHAR(255)`).

**Item de estudo** (agregado central):
```
study_item
  ├─ FKs obrigatórias: historical_perspective, category_level_1/2/3, section
  ├─ FKs opcionais:    continent, country, region, state, city  (+ district texto livre)
  ├─ language VARCHAR(10)
  ├─< study_item_attribute     (attribute_type, attribute, description, image, layout_figure, video_url, layout_video)
  ├─< study_item_chronology    (timeline, register_type Marco|Período, date_format, start_*/end_* dia/mês/ano/referência, bar_color)
  ├─< study_item_association   (type_association, id_associated_study_item + caminho na taxonomia)
  ├─< study_item_hierarchy     (superior / inferior / previous / next → study_item)
  └─< study_item_bible_markup  (id_book, chapter, verse_start, verse_end)
```
Ao atualizar o item, as filhas atuais recebem `excluded = 1` e as novas são reinseridas (substituição total) dentro de uma transação.

**Outros**:
- `banner_slider` (`title, description, status, language, image_url, call_to_action_url, call_to_action_text`); sem DDL
- `book` (`name, canonical_order, status, excluded`); referenciada, mas sem DDL

**Telas sem backend** (só views estáticas no CMS): BibleTranslation, Book, Chapter, BibliographicReference, Publisher, User, Language, InstitutionalVideo, Login, ChangePassword e UserPreferences.

### 6.3 Inconsistências de modelagem
- Em `study_item`, as FKs geográficas são `INT` (com sinal) e as demais são `INT UNSIGNED`.
- `sql/category.sql` e `sql/category_level_1.sql` são idênticos. Há ainda o histórico de migração `category` → `category_level_1`, e `category_level_2_3_recreate...sql` faz DROP e CREATE.
- Não existe ordem de execução definida nem ferramenta de migração.

## 7. Convenções de nomes

| Elemento | Convenção | Exemplo |
|---|---|---|
| Controller | `PascalCase` + `Controller.js` | `CategoryLevel2Controller.js` |
| Model | `PascalCase` + `Model.js` (pasta `model`, no singular) | `StudyItemModel.js` |
| Métodos do controller | `camelCase`, com verbo + entidade + `Page` | `insertCityPage`, `loadUpdatePage` |
| Funções do model | `camelCase`, com verbo + entidade no plural | `selectCities`, `deleteCities` |
| Tabelas e colunas | `snake_case`, tabela no singular, FK `id_<tabela>` | `id_category_level_3` |
| Views | `<área>-<Entidade>-<Sufixo>.ejs` | `cms-City-Q.ejs` |
| Rotas | iguais ao nome da view, mais `/:id` | `/cms-City-U/:id` |
| Campos de formulário | `<entidade><Campo>` em camelCase; FKs como `id_<Entidade>` | `cityName`, `id_State` |
| Props JS vindas do form | camelCase com `id` como prefixo | `idCategoryLevel1` |
| CSS | por componente ou página, em PascalCase ou kebab-case | `parts/navbar.css`, `pages/tools/Timeline.css` |

**Sufixos das views e rotas do CMS**:

| Sufixo | Significado |
|---|---|
| `Q` | Query: lista e consulta |
| `C` | Create: formulário de inclusão (também usado em `GET /:id` para abrir a edição) |
| `U` | Update: formulário de edição / rota de gravação da edição |
| `D` | Delete: modal de confirmação / rota de exclusão |
| `F` | Filter: modal de filtro / rota de filtro |
| `I` | Include: parcial de um formulário maior (ex.: `cms-Hierarchy-I`) |
| `X-<Pai>` | Endpoint AJAX para combo em cascata |

Prefixos `X ` e `xxx `, e sufixos `Old` e `_OLD`, marcam arquivos abandonados que continuam no repositório.

## 8. Tratamento de erros

Não há estratégia centralizada:

- **Sem middleware de erro** do Express e sem `next(err)`.
- **CRUDs simples**: o `try/catch` fica **no model**. O erro vai para o `console.log(err)` e volta como `{ alertTypeResult: "alert-danger", textResult: "Um erro ocorreu..." }`, que o controller mostra num alerta Bootstrap. A mensagem de erro de update e delete repete o texto do insert ("...O registro não foi inserido.").
- **Controllers CRUD não têm `try/catch`** (zero ocorrências fora do StudyItem). Uma falha num SELECT gera *unhandled rejection*: a requisição fica pendurada e o Node 15+ pode encerrar o processo.
- **StudyItem**: o model propaga o erro (`throw` após `rollback`), e o controller captura e faz `res.redirect` para o formulário **sem informar o erro** ao usuário. `parseCollectionJson` engole JSON inválido e devolve `[]`.
- **Não encontrado**: `res.send("City not found")` em texto puro, ou redirect para a lista.
- **Upload sem arquivo**: `res.status(400).json({ message })`. É o único uso de status HTTP explícito.
- **Validação**: só `required` no HTML. O servidor não valida.
- **Log**: `console.log` (inclusive `"XController file starts..."` na carga de cada módulo).

## 9. Configuração e variáveis de ambiente

**Não há variáveis de ambiente.** Não existe `process.env`, `.env` nem `dotenv`.

| Configuração | Onde | Valor |
|---|---|---|
| String de conexão MySQL | `src/db/config.js` (fixo no código) | `mysql://root:123456@localhost:3306/theome` |
| Porta HTTP | `src/server.js` (fixa) | `3000` |
| Diretórios de upload | `src/routes.js` | `public/uploads/banners`, `public/uploads/study-item-attributes` |
| Nome dos arquivos enviados | `src/routes.js` | `<campo>-<timestamp>-<random><ext>` / `attribute-image-<timestamp>-<random><ext>` |
| Limites de upload e tipos aceitos | não configurados | sem `limits` nem `fileFilter` |
| Body parsers | `src/server.js` | `urlencoded({extened:true})` (*typo*: deveria ser `extended`) e `json()` |

## 10. Testes

**Não há testes.** Não existe framework de testes (Jest, Mocha, Vitest...), pasta `test/`, script `npm test` nem CI.

## 11. Lint, formatação e build

- **Lint e formatação**: não há ESLint, Prettier nem EditorConfig. O estilo varia entre arquivos: com e sem ponto e vírgula, indentação de 4 espaços em uns e indentação extra dentro do módulo em outros, `var` e `const`. Os arquivos mais novos (City, StudyItem) parecem formatados com Prettier e usam aspas duplas e `;`.
- **Build**: não há etapa de build, transpilação nem bundler. O Node executa o código direto e o navegador recebe JS e CSS sem processamento.
- **Scripts npm**:
  - `npm run dev` → `nodemon .` (usa `main: src/server.js`)
  - `npm run init-db` → `node src/db/init.js` (**falha**: chama `db.createContinent()`, que não existe)
  - Não há `start`, `test` nem `lint`.
- **Banco**: os arquivos de `sql/` precisam ser executados à mão, numa ordem que respeite as FKs. Faltam os DDLs de `continent`, `country`, `region`, `state`, `city`, `banner_slider` e `book`.
- **Repositório**: não há `.gitignore`, então `node_modules/`, `public/uploads/` e `.dccache` correm o risco de ir para o versionamento.

## 12. Pontos de atenção (para não repetir no `novo`)

1. **Segurança**
   - Credenciais do banco ficam no código, com usuário `root`.
   - `express.static("src")` expõe o código-fonte, incluindo `db/config.js` com a senha, em `GET /db/config.js`.
   - O CMS não tem autenticação nem autorização: a tela de login é só visual.
   - Não há proteção CSRF nos POSTs do CMS.
   - `<%-` sem escape aplicado a dados do banco permite XSS armazenado.
   - Uploads sem limite de tamanho nem filtro de tipo.
2. **Robustez**
   - Uma única conexão global, sem pool nem reconexão.
   - Controllers sem `try/catch` e sem middleware de erro.
   - Não há validação no servidor.
3. **Corretude**
   - Rotas `/HolyBible` e `/ReadingChronologicalPage` renderizam views que não existem.
   - `init-db` está quebrado.
   - `RegionController.filterCountryPage` tem nome copiado de Country.
   - Mensagens de erro de update e delete dizem "não foi inserido".
   - `filterStatus` inicial varia entre `1`, `"1"` e `Number(1)`.
   - O mock `Period` fica duplicado em `routes.js` e `public/scripts/database.js`.
4. **Manutenibilidade**
   - `routes.js` é um arquivo único.
   - Há grande duplicação nos controllers (montagem de `filterStatus`, recarga de combos em todo método) e nas views (`<head>` repetido em cerca de 140 arquivos).
   - O model devolve texto de UI.
   - Arquivos legados e de backup continuam no repositório.
   - Dependências não usadas (`mysql`, `pg`, `bootstrap` 5) convivem com o Bootstrap 4 carregado por CDN.
5. **Dados**
   - Faltam DDLs, versionamento de schema e ordem de execução.
   - Os tipos de FK são inconsistentes (`INT` × `INT UNSIGNED`).
   - Filtros com `LIKE` em colunas numéricas impedem o uso eficiente dos índices.

---

## 13. Decisões para o projeto novo

Estas decisões ainda são **propostas**: cobrem os problemas mais graves da seção 12 e precisam ser confirmadas antes da implementação. Os trechos de código só ilustram a ideia.

**Ordem de implementação:** 13.1 → 13.3 → 13.2 → 13.4 e 13.5 juntos. A 13.1 é rápida e fecha o maior risco. A 13.3 (pool e tratamento de erros) é a base das demais.

### 13.1 Configuração e segredos

| Decisão | Detalhe |
|---|---|
| Servir como estático apenas `public/` | Não repetir `express.static("src")`. No `referencia`, todos os scripts que as páginas carregam (`/scripts/...`) já estão em `public/`. |
| Configuração por variáveis de ambiente | `DATABASE_URL`, `PORT`, `SESSION_SECRET` e `NODE_ENV`, lidas de um `.env` com `dotenv` ou `node --env-file=.env` (Node ≥ 20.6). Um `.env.example` vai versionado e o `.env` não. |
| Usuário de banco dedicado | Nunca `root`. O usuário da aplicação só tem permissões no schema da aplicação. |
| `.gitignore` desde o primeiro commit | `node_modules/`, `.env`, `public/uploads/` e `.dccache`. |

> **Ação no `referencia`:** a senha atual do MySQL está no histórico do Git e deve ser trocada, mesmo depois de removida do código.

### 13.2 Autenticação e segurança do CMS

| Decisão | Detalhe |
|---|---|
| Tabela `user` com senha em hash | `argon2` (preferido) ou `bcrypt`. Nunca em texto puro. |
| Sessão no servidor | `express-session` com store no MySQL (`express-mysql-session`). Cookie `httpOnly`, `sameSite: 'lax'` e `secure` em produção. |
| CMS em router separado e protegido | Todas as rotas do CMS passam por um middleware, exceto a tela de login (ver exemplo abaixo). |
| Proteção CSRF | `csrf-sync` ou `csrf-csrf` em todos os POSTs. O `csurf` foi descontinuado. |
| Cabeçalhos de segurança e limite de tentativas | `helmet` na aplicação e `express-rate-limit` na rota de login. |
| Escape nas views | `<%=` para qualquer dado vindo do banco ou do usuário. `<%-` fica restrito a `include`. |
| Uploads restritos | No multer: `limits: { fileSize }` e um `fileFilter` que aceite só tipos de imagem. |

Exemplo do middleware de proteção do CMS:

```js
function requireAuth(req, res, next) {
  if (req.session.userId) return next();
  return res.redirect('/cms/login');
}
app.use('/cms', requireAuth, cmsRouter);
```

### 13.3 Acesso a dados e tratamento de erros

| Decisão | Detalhe |
|---|---|
| Express 5 | Repassa ao middleware de erro as promises rejeitadas nos handlers `async`. Se o projeto ficar no Express 4, usar um wrapper (ver exemplo abaixo). |
| Middleware de erro e handler 404 | Ficam no fim da cadeia. O middleware de erro registra o erro e mostra uma página 500 amigável. Em rotas JSON, responde com status e `{ message }`. |
| Pool de conexões | `mysql2.createPool(DATABASE_URL)` no lugar de `global.connection`. |
| Transações com conexão própria | `pool.getConnection()` → `beginTransaction` → `commit`/`rollback` → `release()` no `finally`. |
| Model sem texto de UI | O model devolve dados ou lança erro. O controller decide a mensagem e responde com redirect (padrão PRG), passando a mensagem via flash. |
| Validação no servidor | `zod` ou `express-validator` em todo `req.body`. IDs são convertidos para número e campos obrigatórios verificados. |
| Rede de segurança no processo | `process.on('unhandledRejection')` e `process.on('uncaughtException')` registram o erro antes de encerrar o processo. |

Wrapper para handlers `async`, caso o projeto continue no Express 4:

```js
const wrap = fn => (req, res, next) => fn(req, res, next).catch(next);
```

### 13.4 Migrações de banco

| Decisão | Detalhe |
|---|---|
| Migrações versionadas e numeradas | `001_continent.sql`, `002_country.sql` …, em ordem compatível com as FKs. |
| Ferramenta de migração | Knex migrations, `db-migrate` ou Flyway. Alternativa mínima: um runner próprio que registra o que já foi aplicado numa tabela `schema_migrations`. |
| Scripts npm | `npm run db:migrate` no lugar do `init-db`, mais um `db:seed` opcional para dados básicos. |
| Sem duplicatas | Não trazer o `category.sql` duplicado. Consolidar os scripts de rename e recreate num único estado inicial. |

### 13.5 Esquema das tabelas sem DDL

| Decisão | Detalhe |
|---|---|
| Recuperar a estrutura do banco existente | `mysqldump --no-data theome continent country region state city banner_slider book`. O resultado é a fonte mais confiável e vira as primeiras migrações. |
| Tipos de FK padronizados | Toda PK e FK como `INT UNSIGNED`, corrigindo as FKs geográficas de `study_item`, que hoje são `INT` com sinal. |
| Convenções mantidas | As convenções da seção 6.1 continuam valendo: `id_<tabela>`, `status`, `excluded`, `created_at`/`updated_at` e `utf8mb4_unicode_ci`. |
