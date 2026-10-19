const { pool, withTransaction } = require("../db/config");

function escapeLike(text) {
    return `%${String(text).replace(/[\\%_]/g, "\\$&")}%`;
}

function buildWhere({ status, search }) {
    const conditions = ["p.excluded = 0"];
    const values = [];
    if (status !== null && status !== undefined) {
        conditions.push("p.status = ?");
        values.push(status);
    }
    if (search) {
        conditions.push("(p.name LIKE ? OR p.description LIKE ?)");
        values.push(escapeLike(search), escapeLike(search));
    }
    return { where: conditions.join(" AND "), values };
}

async function count(filter) {
    const { where, values } = buildWhere(filter);
    const [rows] = await pool.query(
        `SELECT COUNT(*) AS total FROM access_profile p WHERE ${where}`,
        values,
    );
    return Number(rows[0].total);
}

async function selectList({ limit, offset, ...filter }) {
    const { where, values } = buildWhere(filter);
    const [rows] = await pool.query(
        `
        SELECT p.id, p.name, p.description, p.is_system, p.status,
               (SELECT COUNT(*)
                  FROM app_user_profile up
                  JOIN app_user u ON u.id = up.user_id AND u.excluded = 0
                 WHERE up.profile_id = p.id) AS user_count
        FROM access_profile p
        WHERE ${where}
        ORDER BY p.is_system DESC, p.name ASC
        LIMIT ? OFFSET ?
        `,
        [...values, limit, offset],
    );
    return rows.map((r) => ({ ...r, user_count: Number(r.user_count) }));
}

async function selectActiveOptions() {
    const [rows] = await pool.query(`
        SELECT id, name, description, is_system
        FROM access_profile
        WHERE excluded = 0 AND status = 1
        ORDER BY is_system DESC, name ASC
    `);
    return rows;
}

async function selectById(id) {
    const [rows] = await pool.query(
        `SELECT id, name, description, is_system, status, created_at, updated_at
         FROM access_profile WHERE id = ? AND excluded = 0 LIMIT 1`,
        [id],
    );
    if (!rows[0]) return null;
    const [permissions] = await pool.query(
        `SELECT resource, can_view, can_create, can_update, can_delete
         FROM access_profile_permission WHERE profile_id = ?`,
        [id],
    );
    return { ...rows[0], permissions };
}

async function nameInUse(name, exceptId = null) {
    const [rows] = await pool.query(
        `SELECT id FROM access_profile
         WHERE excluded = 0 AND name = ? AND (? IS NULL OR id <> ?) LIMIT 1`,
        [name, exceptId, exceptId],
    );
    return rows.length > 0;
}

async function replacePermissions(conn, profileId, permissions) {
    await conn.query("DELETE FROM access_profile_permission WHERE profile_id = ?", [profileId]);
    if (permissions.length === 0) return;
    await conn.query(
        `INSERT INTO access_profile_permission
            (profile_id, resource, can_view, can_create, can_update, can_delete)
         VALUES ?`,
        [
            permissions.map((p) => [
                profileId,
                p.resource,
                p.can_view,
                p.can_create,
                p.can_update,
                p.can_delete,
            ]),
        ],
    );
}

async function insert(data, permissions) {
    return withTransaction(async (conn) => {
        const [result] = await conn.query(
            "INSERT INTO access_profile (name, description, status) VALUES (?, ?, ?)",
            [data.name, data.description, data.status],
        );
        await replacePermissions(conn, result.insertId, permissions);
        return result.insertId;
    });
}

// O perfil de sistema (Administrador) não é alterado pela aplicação
async function update(id, data, permissions) {
    return withTransaction(async (conn) => {
        const [result] = await conn.query(
            `UPDATE access_profile SET name = ?, description = ?, status = ?
             WHERE id = ? AND excluded = 0 AND is_system = 0`,
            [data.name, data.description, data.status, id],
        );
        if (result.affectedRows === 0) return 0;
        await replacePermissions(conn, id, permissions);
        return result.affectedRows;
    });
}

// Exclusão lógica; os vínculos com usuários são removidos (deixam de valer)
async function softDelete(id) {
    return withTransaction(async (conn) => {
        const [result] = await conn.query(
            "UPDATE access_profile SET excluded = 1 WHERE id = ? AND excluded = 0 AND is_system = 0",
            [id],
        );
        if (result.affectedRows > 0) {
            await conn.query("DELETE FROM app_user_profile WHERE profile_id = ?", [id]);
        }
        return result.affectedRows;
    });
}

async function findSystemProfileId() {
    const [rows] = await pool.query(
        "SELECT id FROM access_profile WHERE is_system = 1 AND excluded = 0 ORDER BY id LIMIT 1",
    );
    return rows[0]?.id ?? null;
}

module.exports = {
    findSystemProfileId,
    count,
    selectList,
    selectActiveOptions,
    selectById,
    nameInUse,
    insert,
    update,
    softDelete,
};
