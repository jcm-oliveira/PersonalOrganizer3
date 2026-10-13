const { pool } = require("../db/config");

function createLookupModel(
    tableName,
    customSelectFields = "id, name, description, status, created_at, updated_at",
) {
    return {
        async count({ status, search }) {
            const conditions = ["excluded = 0"];
            const values = [];

            if (status !== null) {
                conditions.push("status = ?");
                values.push(status);
            }

            if (search) {
                const term = `%${search.replace(/[\\%_]/g, "\\$&")}%`;
                conditions.push("(name LIKE ? OR description LIKE ?)");
                values.push(term, term);
            }

            const sql = `SELECT COUNT(*) AS total FROM ${tableName} WHERE ${conditions.join(" AND ")}`;
            const [rows] = await pool.query(sql, values);
            return rows[0]?.total ?? 0;
        },

        async selectList({ status, search, page = 1, perPage = 10 }) {
            const conditions = ["excluded = 0"];
            const values = [];

            if (status !== null) {
                conditions.push("status = ?");
                values.push(status);
            }

            if (search) {
                const term = `%${search.replace(/[\\%_]/g, "\\$&")}%`;
                conditions.push("(name LIKE ? OR description LIKE ?)");
                values.push(term, term);
            }

            const offset = (page - 1) * perPage;
            const sql = `
                SELECT ${customSelectFields}
                FROM ${tableName}
                WHERE ${conditions.join(" AND ")}
                ORDER BY name ASC
                LIMIT ? OFFSET ?
            `;
            const [rows] = await pool.query(sql, [...values, perPage, offset]);
            return rows;
        },

        async selectById(id) {
            const sql = `SELECT ${customSelectFields} FROM ${tableName} WHERE id = ? AND excluded = 0 LIMIT 1`;
            const [rows] = await pool.query(sql, [id]);
            return rows[0] || null;
        },

        async selectActiveOptions() {
            const sql = `SELECT id, name FROM ${tableName} WHERE excluded = 0 AND status = 1 ORDER BY name ASC`;
            const [rows] = await pool.query(sql);
            return rows;
        },

        async insert(data) {
            const columns = Object.keys(data);
            const placeholders = columns.map(() => "?").join(", ");
            const values = Object.values(data);
            const sql = `INSERT INTO ${tableName} (${columns.join(", ")}) VALUES (${placeholders})`;
            const [result] = await pool.query(sql, values);
            return result.insertId;
        },

        async update(id, data) {
            const columns = Object.keys(data);
            const assignments = columns.map((col) => `${col} = ?`).join(", ");
            const values = Object.values(data);
            const sql = `UPDATE ${tableName} SET ${assignments} WHERE id = ? AND excluded = 0`;
            const [result] = await pool.query(sql, [...values, id]);
            return result.affectedRows;
        },

        async deleteLogical(id) {
            const sql = `UPDATE ${tableName} SET excluded = 1 WHERE id = ? AND excluded = 0`;
            const [result] = await pool.query(sql, [id]);
            return result.affectedRows;
        },
    };
}

const LifeSphereModel = {
    ...createLookupModel(
        "life_sphere",
        "id, name, description, color_code, status, created_at, updated_at",
    ),
    async selectActiveOptionsWithColor() {
        const sql = `
            SELECT id, name, color_code
            FROM life_sphere
            WHERE excluded = 0 AND status = 1
            ORDER BY name ASC
        `;
        const [rows] = await pool.query(sql);
        return rows;
    },
};

const RelevanceModel = createLookupModel("relevance");
const DayPeriodModel = createLookupModel("day_period");
const PeriodicityModel = createLookupModel("periodicity");
const ActionTypeModel = createLookupModel("action_type");

const ThemeOrganizationModel = {
    async count({ status, search, lifeSphereId }) {
        const conditions = ["t.excluded = 0"];
        const values = [];

        if (status !== null) {
            conditions.push("t.status = ?");
            values.push(status);
        }

        if (lifeSphereId) {
            conditions.push("t.life_sphere_id = ?");
            values.push(Number(lifeSphereId));
        }

        if (search) {
            const term = `%${search.replace(/[\\%_]/g, "\\$&")}%`;
            conditions.push("(t.name LIKE ? OR t.description LIKE ? OR l.name LIKE ?)");
            values.push(term, term, term);
        }

        const sql = `
            SELECT COUNT(*) AS total
            FROM theme_organization t
            LEFT JOIN life_sphere l ON t.life_sphere_id = l.id
            WHERE ${conditions.join(" AND ")}
        `;
        const [rows] = await pool.query(sql, values);
        return rows[0]?.total ?? 0;
    },

    async selectList({ status, search, lifeSphereId, page = 1, perPage = 10 }) {
        const conditions = ["t.excluded = 0"];
        const values = [];

        if (status !== null) {
            conditions.push("t.status = ?");
            values.push(status);
        }

        if (lifeSphereId) {
            conditions.push("t.life_sphere_id = ?");
            values.push(Number(lifeSphereId));
        }

        if (search) {
            const term = `%${search.replace(/[\\%_]/g, "\\$&")}%`;
            conditions.push("(t.name LIKE ? OR t.description LIKE ? OR l.name LIKE ?)");
            values.push(term, term, term);
        }

        const offset = (page - 1) * perPage;
        const sql = `
            SELECT t.id, t.name, t.life_sphere_id, t.description, t.status, t.created_at, t.updated_at,
                   l.name AS life_sphere_name, l.color_code AS life_sphere_color
            FROM theme_organization t
            LEFT JOIN life_sphere l ON t.life_sphere_id = l.id
            WHERE ${conditions.join(" AND ")}
            ORDER BY t.name ASC
            LIMIT ? OFFSET ?
        `;
        const [rows] = await pool.query(sql, [...values, perPage, offset]);
        return rows;
    },

    async selectById(id) {
        const sql = `
            SELECT t.id, t.name, t.life_sphere_id, t.description, t.status, t.created_at, t.updated_at,
                   l.name AS life_sphere_name, l.color_code AS life_sphere_color
            FROM theme_organization t
            LEFT JOIN life_sphere l ON t.life_sphere_id = l.id
            WHERE t.id = ? AND t.excluded = 0
            LIMIT 1
        `;
        const [rows] = await pool.query(sql, [id]);
        return rows[0] || null;
    },

    async selectActiveOptions() {
        const sql = `
            SELECT t.id, t.name, t.life_sphere_id, l.name AS life_sphere_name
            FROM theme_organization t
            LEFT JOIN life_sphere l ON t.life_sphere_id = l.id
            WHERE t.excluded = 0 AND t.status = 1
            ORDER BY t.name ASC
        `;
        const [rows] = await pool.query(sql);
        return rows;
    },

    async insert(data) {
        const columns = Object.keys(data);
        const placeholders = columns.map(() => "?").join(", ");
        const values = Object.values(data);
        const sql = `INSERT INTO theme_organization (${columns.join(", ")}) VALUES (${placeholders})`;
        const [result] = await pool.query(sql, values);
        return result.insertId;
    },

    async update(id, data) {
        const columns = Object.keys(data);
        const assignments = columns.map((col) => `${col} = ?`).join(", ");
        const values = Object.values(data);
        const sql = `UPDATE theme_organization SET ${assignments} WHERE id = ? AND excluded = 0`;
        const [result] = await pool.query(sql, [...values, id]);
        return result.affectedRows;
    },

    async deleteLogical(id) {
        const sql = "UPDATE theme_organization SET excluded = 1 WHERE id = ? AND excluded = 0";
        const [result] = await pool.query(sql, [id]);
        return result.affectedRows;
    },
};

const ActivityStatusModel = {
    ...createLookupModel(
        "activity_status",
        "id, name, description, visibility, color_code, status, created_at, updated_at",
    ),
    async selectActiveOptionsWithStyle() {
        const sql = `
            SELECT id, name, visibility, color_code
            FROM activity_status
            WHERE excluded = 0 AND status = 1
            ORDER BY name ASC
        `;
        const [rows] = await pool.query(sql);
        return rows;
    },
};

module.exports = {
    LifeSphereModel,
    RelevanceModel,
    DayPeriodModel,
    PeriodicityModel,
    ActionTypeModel,
    ThemeOrganizationModel,
    ActivityStatusModel,
};
