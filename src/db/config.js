const mysql = require("mysql2/promise");
const env = require("../config/env");

// O pool só abre conexões na primeira consulta.
const pool = mysql.createPool({
    uri: env.DATABASE_URL,
    connectionLimit: 10,
    waitForConnections: true,
});

// Para gravações que envolvem várias tabelas (agregados). Cada transação usa
// uma conexão própria do pool, que é sempre devolvida no finally.
async function withTransaction(work) {
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();
        const result = await work(conn);
        await conn.commit();
        return result;
    } catch (error) {
        await conn.rollback();
        throw error;
    } finally {
        conn.release();
    }
}

module.exports = { pool, withTransaction };
