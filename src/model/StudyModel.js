const { pool, withTransaction } = require("../db/config");

function escapeLike(text) {
    return `%${String(text).replace(/[\\%_]/g, "\\$&")}%`;
}

// Datas como texto "YYYY-MM-DD" (evita conversão de fuso do driver)
const STUDY_COLUMNS = `
    s.id, s.knowledge_area, s.subject, s.name, s.author, s.study_type, s.hours,
    s.has_certificate, s.material_source, s.stop_point, s.progress,
    DATE_FORMAT(s.start_date, '%Y-%m-%d') AS start_date,
    DATE_FORMAT(s.end_date, '%Y-%m-%d') AS end_date`;

function buildWhere({ situation, type, search, area }) {
    const conditions = ["s.excluded = 0"];
    const values = [];
    if (situation === "open") conditions.push("s.progress < 100");
    if (situation === "finished") conditions.push("s.progress >= 100");
    if (type && type !== "all") {
        conditions.push("s.study_type = ?");
        values.push(type);
    }
    if (area) {
        conditions.push("s.knowledge_area = ?");
        values.push(area);
    }
    if (search) {
        conditions.push(
            "(s.name LIKE ? OR s.author LIKE ? OR s.subject LIKE ? OR s.knowledge_area LIKE ?)",
        );
        const like = escapeLike(search);
        values.push(like, like, like, like);
    }
    return { where: conditions.join(" AND "), values };
}

//------------------------------------------------
//                  CONSULTA
//------------------------------------------------

async function count(filter) {
    const { where, values } = buildWhere(filter);
    const [rows] = await pool.query(`SELECT COUNT(*) AS total FROM study s WHERE ${where}`, values);
    return Number(rows[0].total);
}

/** Em aberto primeiro (maior evolução antes), depois os concluídos (mais recentes antes). */
async function selectList({ limit, offset, ...filter }) {
    const { where, values } = buildWhere(filter);
    const [rows] = await pool.query(
        `
        SELECT ${STUDY_COLUMNS},
               (SELECT COUNT(*) FROM study_attachment a WHERE a.study_id = s.id) AS attachment_count,
               (s.notes IS NOT NULL AND s.notes <> '') AS has_notes
        FROM study s
        WHERE ${where}
        ORDER BY (s.progress >= 100) ASC,
                 CASE WHEN s.progress >= 100 THEN s.end_date END DESC,
                 s.progress DESC, s.knowledge_area ASC, s.name ASC
        LIMIT ? OFFSET ?
        `,
        [...values, limit, offset],
    );
    return rows;
}

async function selectById(id) {
    const [rows] = await pool.query(
        `SELECT ${STUDY_COLUMNS}, s.notes, s.created_at, s.updated_at
         FROM study s WHERE s.id = ? AND s.excluded = 0 LIMIT 1`,
        [id],
    );
    if (!rows[0]) return null;
    const [attachments] = await pool.query(
        `SELECT id, original_name, mime_type, size_bytes, created_at
         FROM study_attachment WHERE study_id = ? ORDER BY created_at ASC, id ASC`,
        [id],
    );
    return { ...rows[0], attachments };
}

async function selectAttachment(studyId, attachmentId) {
    const [rows] = await pool.query(
        `SELECT a.id, a.original_name, a.stored_file, a.mime_type, a.size_bytes
         FROM study_attachment a
         JOIN study s ON s.id = a.study_id AND s.excluded = 0
         WHERE a.study_id = ? AND a.id = ? LIMIT 1`,
        [studyId, attachmentId],
    );
    return rows[0] ?? null;
}

/** Valores já usados (sugestões dos campos Área de conhecimento e Assunto). */
async function selectSuggestions() {
    const [areas] = await pool.query(
        `SELECT DISTINCT knowledge_area AS value FROM study
         WHERE excluded = 0 ORDER BY knowledge_area ASC LIMIT 200`,
    );
    const [subjects] = await pool.query(
        `SELECT DISTINCT subject AS value FROM study
         WHERE excluded = 0 AND subject IS NOT NULL AND subject <> ''
         ORDER BY subject ASC LIMIT 300`,
    );
    return {
        knowledgeAreas: areas.map((r) => r.value),
        subjects: subjects.map((r) => r.value),
    };
}

/** Quadro "Em aberto × Finalizados" por tipo (Leitura / Curso). */
async function getSummary() {
    const [rows] = await pool.query(
        `SELECT study_type,
                SUM(progress < 100) AS open_count,
                SUM(progress >= 100) AS finished_count
         FROM study WHERE excluded = 0
         GROUP BY study_type`,
    );
    return rows.map((r) => ({
        type: r.study_type,
        open: Number(r.open_count) || 0,
        finished: Number(r.finished_count) || 0,
    }));
}

/**
 * Indicadores do Dashboard: quadro por tipo, evolução média dos estudos em aberto,
 * horas e conclusões no ano, estudos em andamento (maior evolução primeiro) e
 * distribuição por área de conhecimento.
 */
async function getDashboardData({ year, inProgressLimit = 8 }) {
    const [summary, [totals], [inProgress], [byArea], [byMonth]] = await Promise.all([
        getSummary(),
        pool.query(
            `SELECT
                ROUND(AVG(CASE WHEN progress < 100 THEN progress END), 0) AS avg_open_progress,
                SUM(progress < 100 AND progress > 0) AS started_count,
                SUM(progress >= 100 AND YEAR(end_date) = ?) AS finished_year,
                COALESCE(SUM(CASE WHEN progress >= 100 AND YEAR(end_date) = ? THEN hours END), 0)
                    AS hours_year,
                COALESCE(SUM(CASE WHEN progress >= 100 THEN hours END), 0) AS hours_total,
                SUM(progress >= 100 AND has_certificate = 1) AS certificates
             FROM study WHERE excluded = 0`,
            [year, year],
        ),
        pool.query(
            `SELECT s.id, s.name, s.study_type, s.knowledge_area, s.progress, s.stop_point,
                    DATE_FORMAT(s.start_date, '%Y-%m-%d') AS start_date
             FROM study s
             WHERE s.excluded = 0 AND s.progress < 100
             ORDER BY (s.progress > 0) DESC, s.progress DESC, s.start_date DESC, s.name ASC
             LIMIT ?`,
            [inProgressLimit],
        ),
        pool.query(
            `SELECT knowledge_area AS label,
                    SUM(progress < 100) AS open_count,
                    SUM(progress >= 100) AS finished_count
             FROM study WHERE excluded = 0
             GROUP BY knowledge_area
             ORDER BY COUNT(*) DESC, knowledge_area ASC`,
        ),
        pool.query(
            `SELECT MONTH(end_date) AS month, COUNT(*) AS total
             FROM study
             WHERE excluded = 0 AND progress >= 100 AND YEAR(end_date) = ?
             GROUP BY MONTH(end_date)`,
            [year],
        ),
    ]);
    const t = totals[0] || {};
    return {
        summary,
        avgOpenProgress: t.avg_open_progress === null ? null : Number(t.avg_open_progress),
        startedCount: Number(t.started_count) || 0,
        finishedYear: Number(t.finished_year) || 0,
        hoursYear: Number(t.hours_year) || 0,
        hoursTotal: Number(t.hours_total) || 0,
        certificates: Number(t.certificates) || 0,
        inProgress,
        byArea: byArea.map((r) => ({
            label: r.label,
            open: Number(r.open_count) || 0,
            finished: Number(r.finished_count) || 0,
        })),
        finishedByMonth: byMonth.map((r) => ({ month: Number(r.month), total: Number(r.total) })),
    };
}

//------------------------------------------------
//                  GRAVAÇÃO
//------------------------------------------------

const DATA_FIELDS = [
    "knowledge_area",
    "subject",
    "name",
    "author",
    "study_type",
    "hours",
    "has_certificate",
    "material_source",
    "stop_point",
    "progress",
    "start_date",
    "end_date",
    "notes",
];

async function insertAttachments(conn, studyId, files) {
    if (!files || files.length === 0) return;
    await conn.query(
        `INSERT INTO study_attachment (study_id, original_name, stored_file, mime_type, size_bytes)
         VALUES ?`,
        [files.map((f) => [studyId, f.originalname, f.filename, f.mimetype, f.size])],
    );
}

/** files: arquivos do multer ({ originalname, filename, mimetype, size }). */
async function insert(data, files = []) {
    return withTransaction(async (conn) => {
        const [result] = await conn.query(
            `INSERT INTO study (${DATA_FIELDS.join(", ")})
             VALUES (${DATA_FIELDS.map(() => "?").join(", ")})`,
            DATA_FIELDS.map((field) => data[field] ?? null),
        );
        await insertAttachments(conn, result.insertId, files);
        return result.insertId;
    });
}

/**
 * Atualiza os dados, inclui os novos anexos e remove os marcados.
 * Retorna { affectedRows, removedFiles } (nomes gravados em disco dos anexos removidos,
 * para o controller apagar os arquivos depois do commit).
 */
async function update(id, data, files = [], removeAttachmentIds = []) {
    return withTransaction(async (conn) => {
        const [result] = await conn.query(
            `UPDATE study SET ${DATA_FIELDS.map((field) => `${field} = ?`).join(", ")}
             WHERE id = ? AND excluded = 0`,
            [...DATA_FIELDS.map((field) => data[field] ?? null), id],
        );
        if (result.affectedRows === 0) return { affectedRows: 0, removedFiles: [] };

        let removedFiles = [];
        if (removeAttachmentIds.length > 0) {
            const [rows] = await conn.query(
                "SELECT id, stored_file FROM study_attachment WHERE study_id = ? AND id IN (?)",
                [id, removeAttachmentIds],
            );
            if (rows.length > 0) {
                await conn.query("DELETE FROM study_attachment WHERE study_id = ? AND id IN (?)", [
                    id,
                    rows.map((r) => r.id),
                ]);
                removedFiles = rows.map((r) => r.stored_file);
            }
        }
        await insertAttachments(conn, id, files);
        return { affectedRows: result.affectedRows, removedFiles };
    });
}

/** Exclusão lógica: os anexos continuam guardados (o registro pode ser recuperado). */
async function softDelete(id) {
    const [result] = await pool.query(
        "UPDATE study SET excluded = 1 WHERE id = ? AND excluded = 0",
        [id],
    );
    return result.affectedRows;
}

module.exports = {
    count,
    selectList,
    selectById,
    selectAttachment,
    selectSuggestions,
    getSummary,
    getDashboardData,
    insert,
    update,
    softDelete,
};
