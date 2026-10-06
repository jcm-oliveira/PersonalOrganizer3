const { pool } = require("../db/config");

// status: 0 | 1 | null (null = todos). Registros com excluded = 1 nunca aparecem.
function buildWhere({ status, search }) {
    const conditions = ["excluded = 0"];
    const values = [];

    if (status !== null) {
        conditions.push("status = ?");
        values.push(status);
    }

    if (search) {
        const term = `%${search.replace(/[\\%_]/g, "\\$&")}%`;
        if (/^\d+$/.test(search)) {
            conditions.push("(name LIKE ? OR id = ?)");
            values.push(term, Number(search));
        } else {
            conditions.push("name LIKE ?");
            values.push(term);
        }
    }

    return { where: conditions.join(" AND "), values };
}

//------------------------------------------------
//                     SELECT
//------------------------------------------------

async function selectExamples({ status, search, limit, offset }) {
    const { where, values } = buildWhere({ status, search });
    const sql = `
        SELECT id, name, description, status, created_at, updated_at
        FROM example
        WHERE ${where}
        ORDER BY id DESC
        LIMIT ? OFFSET ?
    `;
    const [rows] = await pool.query(sql, [...values, limit, offset]);
    return rows;
}

async function countExamples({ status, search }) {
    const { where, values } = buildWhere({ status, search });
    const [rows] = await pool.query(`SELECT COUNT(*) AS total FROM example WHERE ${where}`, values);
    return Number(rows[0].total);
}

async function selectExampleById(id) {
    const sql = `
        SELECT id, name, description, status, created_at, updated_at
        FROM example
        WHERE id = ? AND excluded = 0
        LIMIT 1
    `;
    const [rows] = await pool.query(sql, [id]);
    return rows[0] ?? null;
}

//------------------------------------------------
//                     INSERT
//------------------------------------------------

async function insertExample({ name, description, status }) {
    const sql = `INSERT INTO example (name, description, status) VALUES (?, ?, ?)`;
    const [result] = await pool.query(sql, [name, description, status]);
    return result.insertId;
}

//------------------------------------------------
//                     UPDATE
//------------------------------------------------

async function updateExample(id, { name, description, status }) {
    const sql = `
        UPDATE example
        SET name = ?, description = ?, status = ?
        WHERE id = ? AND excluded = 0
    `;
    const [result] = await pool.query(sql, [name, description, status, id]);
    return result.affectedRows;
}

//------------------------------------------------
//                 DELETE (lógico)
//------------------------------------------------

async function deleteExample(id) {
    const sql = `UPDATE example SET excluded = 1 WHERE id = ? AND excluded = 0`;
    const [result] = await pool.query(sql, [id]);
    return result.affectedRows;
}

module.exports = {
    selectExamples,
    countExamples,
    selectExampleById,
    insertExample,
    updateExample,
    deleteExample,
};
