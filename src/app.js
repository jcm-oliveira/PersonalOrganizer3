const path = require("node:path");
const express = require("express");
const helmet = require("helmet");
const session = require("express-session");
const MySQLStoreFactory = require("express-mysql-session");
const env = require("./config/env");
const { pool } = require("./db/config");
const routes = require("./routes");
const { createPublicRoutes } = require("./routes/authRoutes");
const { loadCurrentUser } = require("./middlewares/auth");
const { exposeCsrfToken, csrfProtection } = require("./middlewares/csrf");
const { notFound, errorHandler } = require("./middlewares/errorHandlers");

const SESSION_MAX_AGE_MS = 8 * 60 * 60 * 1000; // 8 horas sem uso encerram a sessão

function createSessionStore() {
    // Testes automatizados usam a store em memória do express-session
    if (env.NODE_ENV === "test") return undefined;
    const MySQLStore = MySQLStoreFactory(session);
    return new MySQLStore(
        {
            createDatabaseTable: false, // tabela "sessions" criada pela migração 008
            clearExpired: true,
            checkExpirationInterval: 15 * 60 * 1000,
            expiration: SESSION_MAX_AGE_MS,
        },
        pool,
    );
}

/**
 * options (somente com NODE_ENV=test):
 *  - currentUser: usuário fixo para todas as requisições (dispensa o login)
 *  - csrf: false desliga a verificação de CSRF
 */
function createApp(options = {}) {
    const { currentUser, csrf = true } = options;
    if ((currentUser !== undefined || csrf === false) && env.NODE_ENV !== "test") {
        throw new Error("As opções currentUser/csrf de createApp são exclusivas dos testes.");
    }

    const app = express();

    app.set('trust proxy', 1);

    app.set("view engine", "ejs");
    app.set("views", path.join(__dirname, "views"));

    app.use(
        helmet({
            contentSecurityPolicy: {
                directives: {
                    "script-src": ["'self'", "https://cdn.jsdelivr.net", "https://code.jquery.com"],
                    "style-src": [
                        "'self'",
                        "https://cdn.jsdelivr.net",
                        "https://fonts.googleapis.com",
                    ],
                    "font-src": ["'self'", "https://fonts.gstatic.com", "https://cdn.jsdelivr.net"],
                },
            },
        }),
    );

    // Apenas public/ é estático. Nunca servir src/ (docs/ARQUITETURA.md, seção 13.1).
    app.use(express.static(path.join(__dirname, "..", "public")));
    app.use(express.urlencoded({ extended: false }));
    app.use(express.json());

    // Sessão de login (docs/ARQUITETURA.md, seção 13.2)
    app.use(
        session({
            name: "po.sid",
            secret: env.SESSION_SECRET,
            store: createSessionStore(),
            resave: false,
            saveUninitialized: false,
            rolling: true,
            cookie: {
                httpOnly: true,
                sameSite: "lax",
                secure: env.NODE_ENV === "production",
                maxAge: SESSION_MAX_AGE_MS,
            },
        }),
    );

    // CSRF em todos os POSTs (multipart é validado na rota, depois do upload)
    app.locals.csrfEnabled = csrf;
    if (csrf) {
        app.use(exposeCsrfToken);
        app.use(csrfProtection);
    }

    app.use(loadCurrentUser(currentUser !== undefined ? { resolveUser: () => currentUser } : {}));

    app.use(createPublicRoutes());
    app.use(routes);

    app.use(notFound);
    app.use(errorHandler);

    return app;
}

module.exports = { createApp };
