const { pool, withTransaction } = require("../db/config");

function escapeLike(text) {
    return `%${String(text).replace(/[\\%_]/g, "\\$&")}%`;
}

// Usuário ativo com o perfil de sistema (Administrador) ativo
const ADMIN_EXISTS_SQL = `
    EXISTS (
        SELECT 1 FROM app_user_profile up
        JOIN access_profile p ON p.id = up.profile_id
        WHERE up.user_id = u.id AND p.is_system = 1 AND p.status = 1 AND p.excluded = 0
    )`;

//------------------------------------------------
//               LOGIN E SESSÃO
//------------------------------------------------

async function countUsers() {
    const [rows] = await pool.query("SELECT COUNT(*) AS total FROM app_user WHERE excluded = 0");
    return Number(rows[0].total);
}

async function findForLogin(email) {
    const [rows] = await pool.query(
        `SELECT id, name, email, password_hash, status, session_version
         FROM app_user WHERE excluded = 0 AND email = ? LIMIT 1`,
        [email],
    );
    return rows[0] ?? null;
}

/** Usuário da sessão com perfis e permissões (somente perfis ativos). */
async function findSessionUser(id) {
    const [rows] = await pool.query(
        `SELECT u.id, u.name, u.email, u.photo_file, u.session_version
         FROM app_user u
         WHERE u.id = ? AND u.excluded = 0 AND u.status = 1 LIMIT 1`,
        [id],
    );
    if (!rows[0]) return null;
    const [profiles] = await pool.query(
        `SELECT p.id, p.name, p.is_system
         FROM app_user_profile up
         JOIN access_profile p ON p.id = up.profile_id
         WHERE up.user_id = ? AND p.excluded = 0 AND p.status = 1`,
        [id],
    );
    const profileIds = profiles.map((p) => p.id);
    let permissions = [];
    if (profileIds.length > 0) {
        [permissions] = await pool.query(
            `SELECT resource, can_view, can_create, can_update, can_delete
             FROM access_profile_permission WHERE profile_id IN (?)`,
            [profileIds],
        );
    }
    return { ...rows[0], profiles, permissionRows: permissions };
}

async function updateLastLogin(id) {
    await pool.query("UPDATE app_user SET last_login_at = NOW() WHERE id = ?", [id]);
}

/** Troca da própria senha: encerra as outras sessões do usuário. */
async function updatePassword(id, passwordHash) {
    const [result] = await pool.query(
        `UPDATE app_user SET password_hash = ?, session_version = session_version + 1
         WHERE id = ? AND excluded = 0`,
        [passwordHash, id],
    );
    return result.affectedRows;
}

//------------------------------------------------
//                  CADASTRO
//------------------------------------------------

function buildWhere({ status, search, profileId }) {
    const conditions = ["u.excluded = 0"];
    const values = [];
    if (status !== null && status !== undefined) {
        conditions.push("u.status = ?");
        values.push(status);
    }
    if (search) {
        conditions.push("(u.name LIKE ? OR u.email LIKE ? OR u.phone LIKE ?)");
        values.push(escapeLike(search), escapeLike(search), escapeLike(search));
    }
    if (profileId) {
        conditions.push(
            "EXISTS (SELECT 1 FROM app_user_profile f WHERE f.user_id = u.id AND f.profile_id = ?)",
        );
        values.push(profileId);
    }
    return { where: conditions.join(" AND "), values };
}

async function count(filter) {
    const { where, values } = buildWhere(filter);
    const [rows] = await pool.query(
        `SELECT COUNT(*) AS total FROM app_user u WHERE ${where}`,
        values,
    );
    return Number(rows[0].total);
}

async function selectList({ limit, offset, ...filter }) {
    const { where, values } = buildWhere(filter);
    const [rows] = await pool.query(
        `
        SELECT u.id, u.name, u.email, u.phone, u.photo_file, u.status, u.last_login_at,
               (SELECT GROUP_CONCAT(p.name ORDER BY p.is_system DESC, p.name SEPARATOR ', ')
                  FROM app_user_profile up
                  JOIN access_profile p ON p.id = up.profile_id AND p.excluded = 0
                 WHERE up.user_id = u.id) AS profile_names
        FROM app_user u
        WHERE ${where}
        ORDER BY u.name ASC
        LIMIT ? OFFSET ?
        `,
        [...values, limit, offset],
    );
    return rows;
}

async function selectById(id) {
    const [rows] = await pool.query(
        `SELECT id, name, email, phone, description, photo_file, status, last_login_at,
                created_at, updated_at
         FROM app_user WHERE id = ? AND excluded = 0 LIMIT 1`,
        [id],
    );
    if (!rows[0]) return null;
    const [profiles] = await pool.query(
        `SELECT p.id, p.name, p.is_system
         FROM app_user_profile up
         JOIN access_profile p ON p.id = up.profile_id AND p.excluded = 0
         WHERE up.user_id = ?
         ORDER BY p.is_system DESC, p.name ASC`,
        [id],
    );
    return { ...rows[0], profiles };
}

async function selectPhotoFile(id) {
    const [rows] = await pool.query(
        "SELECT photo_file FROM app_user WHERE id = ? AND excluded = 0 LIMIT 1",
        [id],
    );
    return rows[0]?.photo_file ?? null;
}

async function emailInUse(email, exceptId = null) {
    const [rows] = await pool.query(
        `SELECT id FROM app_user
         WHERE excluded = 0 AND email = ? AND (? IS NULL OR id <> ?) LIMIT 1`,
        [email, exceptId, exceptId],
    );
    return rows.length > 0;
}

/** Quantos administradores ativos existem, desconsiderando um usuário (opcional). */
async function countActiveAdmins(exceptUserId = null) {
    const [rows] = await pool.query(
        `SELECT COUNT(*) AS total FROM app_user u
         WHERE u.excluded = 0 AND u.status = 1 AND (? IS NULL OR u.id <> ?) AND ${ADMIN_EXISTS_SQL}`,
        [exceptUserId, exceptUserId],
    );
    return Number(rows[0].total);
}

async function replaceProfiles(conn, userId, profileIds) {
    await conn.query("DELETE FROM app_user_profile WHERE user_id = ?", [userId]);
    if (profileIds.length === 0) return;
    await conn.query("INSERT INTO app_user_profile (user_id, profile_id) VALUES ?", [
        profileIds.map((profileId) => [userId, profileId]),
    ]);
}

async function insert(data, profileIds) {
    return withTransaction(async (conn) => {
        const [result] = await conn.query(
            `INSERT INTO app_user (name, email, phone, description, photo_file, password_hash, status)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
                data.name,
                data.email,
                data.phone,
                data.description,
                data.photo_file ?? null,
                data.password_hash,
                data.status,
            ],
        );
        await replaceProfiles(conn, result.insertId, profileIds);
        return result.insertId;
    });
}

/**
 * Atualiza dados e perfis. Se houver nova senha (data.password_hash) ou o usuário
 * for inativado, incrementa session_version (encerra as sessões abertas dele).
 * data.photo_file: undefined = mantém; null = remove; texto = nova foto.
 */
async function update(id, data, profileIds) {
    return withTransaction(async (conn) => {
        const sets = ["name = ?", "email = ?", "phone = ?", "description = ?", "status = ?"];
        const values = [data.name, data.email, data.phone, data.description, data.status];
        if (data.photo_file !== undefined) {
            sets.push("photo_file = ?");
            values.push(data.photo_file);
        }
        if (data.password_hash) {
            sets.push("password_hash = ?");
            values.push(data.password_hash);
        }
        if (data.password_hash || data.status === 0) {
            sets.push("session_version = session_version + 1");
        }
        const [result] = await conn.query(
            `UPDATE app_user SET ${sets.join(", ")} WHERE id = ? AND excluded = 0`,
            [...values, id],
        );
        if (result.affectedRows === 0) return 0;
        await replaceProfiles(conn, id, profileIds);
        return result.affectedRows;
    });
}

async function softDelete(id) {
    const [result] = await pool.query(
        `UPDATE app_user SET excluded = 1, session_version = session_version + 1
         WHERE id = ? AND excluded = 0`,
        [id],
    );
    return result.affectedRows;
}

module.exports = {
    countUsers,
    findForLogin,
    findSessionUser,
    updateLastLogin,
    updatePassword,
    count,
    selectList,
    selectById,
    selectPhotoFile,
    emailInUse,
    countActiveAdmins,
    insert,
    update,
    softDelete,
};
