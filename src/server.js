// ===== DIAGNÓSTICO TEMPORÁRIO - remover depois =====
(async () => {
  const mysql = require('mysql2/promise');
  const crypto = require('crypto');
  const fp = s => s ? crypto.createHash('sha256').update(s).digest('hex').slice(0, 8) : String(s);
  const { DB_USER, DB_PASSWORD, DB_NAME } = process.env;
  console.log('[DIAG] env', { DB_USER, DB_NAME, pass_fp: fp(DB_PASSWORD), pass_len: DB_PASSWORD?.length });

  const tentativas = [
    { nome: 'tcp 127.0.0.1', host: '127.0.0.1' },
    { nome: 'tcp localhost', host: 'localhost' },
    { nome: 'socket /var/lib/mysql/mysql.sock', socketPath: '/var/lib/mysql/mysql.sock' },
    { nome: 'socket /var/run/mysqld/mysqld.sock', socketPath: '/var/run/mysqld/mysqld.sock' },
    { nome: 'socket /tmp/mysql.sock', socketPath: '/tmp/mysql.sock' },
  ];
  for (const t of tentativas) {
    const { nome, ...opts } = t;
    try {
      const c = await mysql.createConnection({ ...opts, user: DB_USER, password: DB_PASSWORD, database: DB_NAME });
      const [r] = await c.query('SELECT CURRENT_USER() AS u');
      console.log('[DIAG] OK  ', nome, '->', r[0].u);
      await c.end();
    } catch (e) {
      console.log('[DIAG] FALHA', nome, '->', e.code);
    }
  }
})();
// ===== FIM DO DIAGNÓSTICO =====

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
