const env = require("./config/env");
const { createApp } = require("./app");
const { pool } = require("./db/config");

const server = createApp().listen(env.PORT, () => {
    console.log(`Servidor rodando em http://localhost:${env.PORT}`);
});

function shutdown(signal) {
    console.log(`${signal} recebido, encerrando...`);
    server.close(() => {
        pool.end().finally(() => process.exit(0));
    });
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

process.on("unhandledRejection", (reason) => {
    console.error("Promise rejeitada sem tratamento:", reason);
    process.exit(1);
});

process.on("uncaughtException", (error) => {
    console.error("Exceção não capturada:", error);
    process.exit(1);
});
