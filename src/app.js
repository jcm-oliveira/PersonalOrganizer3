const path = require("node:path");
const express = require("express");
const helmet = require("helmet");
const routes = require("./routes");
const { notFound, errorHandler } = require("./middlewares/errorHandlers");

function createApp() {
    const app = express();

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

    app.use(routes);

    app.use(notFound);
    app.use(errorHandler);

    return app;
}

module.exports = { createApp };
