// Aplica, em ordem, os arquivos sql/migrations/NNN_*.sql ainda não registrados em
// schema_migrations. Atenção: no MySQL, DDL faz commit implícito. Se uma migração
// falhar no meio, corrija o banco manualmente antes de rodar de novo.
const fs = require("node:fs/promises");
const path = require("node:path");
const mysql = require("mysql2/promise");
const env = require("../src/config/env");

const MIGRATIONS_DIR = path.join(__dirname, "..", "sql", "migrations");
const MIGRATION_FILE = /^\d{3}_[\w-]+\.sql$/;

async function migrate() {
    const conn = await mysql.createConnection({ uri: env.DATABASE_URL, multipleStatements: true });
    try {
        await conn.query(`
            CREATE TABLE IF NOT EXISTS schema_migrations (
                name VARCHAR(255) NOT NULL PRIMARY KEY,
                applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);

        const [rows] = await conn.query("SELECT name FROM schema_migrations");
        const applied = new Set(rows.map((row) => row.name));
        const files = (await fs.readdir(MIGRATIONS_DIR))
            .filter((file) => MIGRATION_FILE.test(file))
            .sort();
        const pending = files.filter((file) => !applied.has(file));

        if (pending.length === 0) {
            console.log("Nenhuma migração pendente.");
            return;
        }

        for (const file of pending) {
            console.log(`Aplicando ${file}...`);
            const sql = await fs.readFile(path.join(MIGRATIONS_DIR, file), "utf8");
            await conn.query(sql);
            await conn.query("INSERT INTO schema_migrations (name) VALUES (?)", [file]);
        }
        console.log(`${pending.length} migração(ões) aplicada(s).`);
    } finally {
        await conn.end();
    }
}

migrate().catch((error) => {
    console.error("Falha na migração:", error.message);
    process.exitCode = 1;
});
