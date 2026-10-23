const { pool } = require("../db/config");

// Filtro de status: null = todos | "visible" = status visíveis por padrão | número = id do status
function pushStatusCondition(status, conditions, values) {
    if (status === "visible") {
        conditions.push(
            "status IN (SELECT id FROM activity_status WHERE excluded = 0 AND status = 1 AND visibility = 1)",
        );
    } else if (status !== null && status !== undefined) {
        conditions.push("status = ?");
        values.push(status);
    }
}

/**
 * Atividade atrasada: data anterior a hoje ou, hoje, com horário de início até
 * overdueTime (agora - 5 min, ver getOverdueReference). Retorna SQL e valores.
 */
function overdueCondition(todayStr, overdueTime) {
    if (!overdueTime) return { sql: "next_activity_date < ?", values: [todayStr] };
    return {
        sql: "(next_activity_date < ? OR (next_activity_date = ? AND scheduled_time IS NOT NULL AND scheduled_time <= ?))",
        values: [todayStr, todayStr, overdueTime],
    };
}

function buildWhere({
    status,
    search,
    lifeSphere,
    activityType,
    actionType,
    trafficLight,
    todayStr,
    overdueTime,
}) {
    const conditions = ["excluded = 0"];
    const values = [];

    pushStatusCondition(status, conditions, values);

    if (lifeSphere) {
        conditions.push("life_sphere = ?");
        values.push(lifeSphere);
    }

    if (activityType) {
        conditions.push("activity_type = ?");
        values.push(activityType);
    }

    if (actionType) {
        conditions.push("action_type = ?");
        values.push(actionType);
    }

    if (trafficLight && todayStr) {
        const overdue = overdueCondition(todayStr, overdueTime);
        if (trafficLight === "ATRASADA") {
            conditions.push(overdue.sql);
            values.push(...overdue.values);
        } else if (trafficLight === "HOJE") {
            // Hoje e ainda não atrasada
            conditions.push(`next_activity_date = ? AND NOT ${overdue.sql}`);
            values.push(todayStr, ...overdue.values);
        } else if (trafficLight === "7_DIAS") {
            conditions.push(
                "next_activity_date > ? AND next_activity_date <= DATE_ADD(?, INTERVAL 7 DAY)",
            );
            values.push(todayStr, todayStr);
        } else if (trafficLight === "15_DIAS") {
            conditions.push(
                "next_activity_date > DATE_ADD(?, INTERVAL 7 DAY) AND next_activity_date <= DATE_ADD(?, INTERVAL 15 DAY)",
            );
            values.push(todayStr, todayStr);
        } else if (trafficLight === "PRAZO") {
            conditions.push(
                "final_deadline IS NOT NULL AND final_deadline <= DATE_ADD(?, INTERVAL 7 DAY) AND final_deadline >= ?",
            );
            values.push(todayStr, todayStr);
        }
    }

    if (search) {
        const term = `%${search.replace(/[\\%_]/g, "\\$&")}%`;
        if (/^\d+$/.test(search)) {
            conditions.push("(description LIKE ? OR theme_organization LIKE ? OR id = ?)");
            values.push(term, term, Number(search));
        } else {
            conditions.push("(description LIKE ? OR theme_organization LIKE ? OR notes LIKE ?)");
            values.push(term, term, term);
        }
    }

    return { where: conditions.join(" AND "), values };
}

//------------------------------------------------
//                     SELECT
//------------------------------------------------

// Critérios de filtro: ver buildWhere (status, busca, esfera, ..., todayStr, overdueTime)
async function selectActivities({ limit, offset, ...criteria }) {
    const { where, values } = buildWhere(criteria);

    const sql = `
        SELECT
            id,
            life_sphere,
            description,
            activity_type,
            next_activity_date,
            final_deadline,
            day_period,
            scheduled_time,
            duration_hours,
            recurrence_rule,
            action_type,
            theme_organization,
            notify_before_minutes,
            notes,
            status,
            created_at,
            updated_at
        FROM activity
        WHERE ${where}
        ORDER BY next_activity_date IS NULL, next_activity_date ASC, id DESC
        LIMIT ? OFFSET ?
    `;

    const [rows] = await pool.query(sql, [...values, limit, offset]);
    return rows;
}

async function countActivities(criteria) {
    const { where, values } = buildWhere(criteria);
    const [rows] = await pool.query(
        `SELECT COUNT(*) AS total FROM activity WHERE ${where}`,
        values,
    );
    return Number(rows[0].total);
}

/**
 * Atividades do calendário: próxima atividade OU prazo final dentro do intervalo
 * [start, end) exibido, com o mesmo filtro de status da consulta.
 */
async function selectActivitiesForCalendar({ start, end, status }) {
    const conditions = [
        "excluded = 0",
        `((next_activity_date >= ? AND next_activity_date < ?)
            OR (final_deadline >= ? AND final_deadline < ?)
            OR (recurrence_rule IS NOT NULL AND next_activity_date < ?))`,
    ];
    const values = [start, end, start, end, end];
    pushStatusCondition(status, conditions, values);

    const sql = `
        SELECT
            id,
            life_sphere,
            description,
            activity_type,
            next_activity_date,
            final_deadline,
            day_period,
            scheduled_time,
            duration_hours,
            recurrence_rule,
            action_type,
            theme_organization,
            notify_before_minutes,
            status
        FROM activity
        WHERE ${conditions.join(" AND ")}
        ORDER BY next_activity_date ASC, scheduled_time ASC, id ASC
    `;
    const [rows] = await pool.query(sql, values);
    return rows;
}

// Notificação com antecedência: atividades com a próxima data no intervalo [de, até]
// e status visível (pop-up de aviso exibido em todas as páginas)
async function selectUpcomingReminders(fromDate, toDate) {
    const conditions = ["excluded = 0", "next_activity_date >= ?", "next_activity_date <= ?"];
    const values = [fromDate, toDate];
    pushStatusCondition("visible", conditions, values);

    const sql = `
        SELECT
            id,
            description,
            next_activity_date,
            scheduled_time,
            notify_before_minutes
        FROM activity
        WHERE ${conditions.join(" AND ")}
        ORDER BY next_activity_date ASC, scheduled_time ASC, id ASC
    `;
    const [rows] = await pool.query(sql, values);
    return rows;
}

async function selectActivityById(id) {
    const sql = `
        SELECT
            id,
            life_sphere,
            description,
            activity_type,
            next_activity_date,
            final_deadline,
            day_period,
            scheduled_time,
            duration_hours,
            recurrence_rule,
            action_type,
            theme_organization,
            notify_before_minutes,
            notes,
            status,
            created_at,
            updated_at
        FROM activity
        WHERE id = ? AND excluded = 0
        LIMIT 1
    `;
    const [rows] = await pool.query(sql, [id]);
    return rows[0] ?? null;
}

/**
 * Estatísticas do Painel de Voo / Resumo
 */
async function getActivityStats(todayStr, overdueTime = null) {
    const overdue = overdueCondition(todayStr, overdueTime);
    const sql = `
        SELECT
            COUNT(CASE WHEN final_deadline IS NOT NULL AND final_deadline <= DATE_ADD(?, INTERVAL 7 DAY) AND final_deadline >= ? THEN 1 END) AS prazo_final_7_dias,
            COUNT(CASE WHEN ${overdue.sql} THEN 1 END) AS vencidas,
            COUNT(CASE WHEN next_activity_date >= ? AND next_activity_date <= DATE_ADD(?, INTERVAL 7 DAY) AND NOT ${overdue.sql} THEN 1 END) AS proximos_7_dias,
            COUNT(CASE WHEN next_activity_date > DATE_ADD(?, INTERVAL 7 DAY) AND next_activity_date <= DATE_ADD(?, INTERVAL 15 DAY) THEN 1 END) AS entre_7_e_15_dias,
            COUNT(CASE WHEN activity_type = 'Prioridade' THEN 1 END) AS priorizados,
            COUNT(CASE WHEN activity_type = 'Backlog' THEN 1 END) AS backlog,
            COUNT(*) AS total_ativos
        FROM activity
        WHERE excluded = 0 AND status = 1
    `;
    const [rows] = await pool.query(sql, [
        todayStr,
        todayStr,
        ...overdue.values,
        todayStr,
        todayStr,
        ...overdue.values,
        todayStr,
        todayStr,
    ]);

    const stat = rows[0] || {};
    return {
        prazoFinal7Dias: Number(stat.prazo_final_7_dias || 0),
        vencidas: Number(stat.vencidas || 0),
        proximos7Dias: Number(stat.proximos_7_dias || 0),
        entre7e15Dias: Number(stat.entre_7_e_15_dias || 0),
        priorizados: Number(stat.priorizados || 0),
        backlog: Number(stat.backlog || 0),
        totalAtivos: Number(stat.total_ativos || 0),
    };
}

const VISIBLE_STATUS_SQL =
    "status IN (SELECT id FROM activity_status WHERE excluded = 0 AND status = 1 AND visibility = 1)";

/**
 * Distribuição (balanceamento) das atividades para os gráficos do Dashboard.
 * Status considera todas as atividades; as demais dimensões, só as de status
 * visíveis por padrão (mesmo padrão da consulta e do calendário).
 */
async function getActivityDistribution(todayStr, overdueTime = null) {
    const overdue = overdueCondition(todayStr, overdueTime);
    const groupBy = async (expression) => {
        const [rows] = await pool.query(`
            SELECT ${expression} AS label, COUNT(*) AS total
            FROM activity
            WHERE excluded = 0 AND ${VISIBLE_STATUS_SQL}
            GROUP BY label
        `);
        return rows.map((r) => ({ label: r.label, total: Number(r.total) }));
    };

    const [bySphere, byActionType, byActivityType, byStatusRows, byScheduleRows] =
        await Promise.all([
            groupBy("life_sphere"),
            groupBy("COALESCE(NULLIF(TRIM(action_type), ''), 'Não informado')"),
            groupBy("activity_type"),
            pool.query(`
            SELECT status AS status_id, COUNT(*) AS total
            FROM activity
            WHERE excluded = 0
            GROUP BY status
        `),
            pool.query(
                `
            SELECT
                CASE
                    WHEN ${overdue.sql} THEN 'ATRASADO'
                    WHEN DATEDIFF(next_activity_date, ?) = 0 THEN 'HOJE'
                    WHEN DATEDIFF(next_activity_date, ?) = 1 THEN 'AMANHA'
                    WHEN DATEDIFF(next_activity_date, ?) <= 7 THEN 'ATE_7'
                    WHEN DATEDIFF(next_activity_date, ?) <= 15 THEN 'ATE_15'
                    ELSE 'MAIS_15'
                END AS bucket,
                COUNT(*) AS total
            FROM activity
            WHERE excluded = 0 AND ${VISIBLE_STATUS_SQL}
            GROUP BY bucket
        `,
                [...overdue.values, todayStr, todayStr, todayStr, todayStr],
            ),
        ]);

    return {
        bySphere,
        byActionType,
        byActivityType,
        byStatus: byStatusRows[0].map((r) => ({
            statusId: Number(r.status_id),
            total: Number(r.total),
        })),
        bySchedule: byScheduleRows[0].map((r) => ({ bucket: r.bucket, total: Number(r.total) })),
    };
}

//------------------------------------------------
//                     INSERT
//------------------------------------------------

async function insertActivity(data) {
    const sql = `
        INSERT INTO activity (
            life_sphere,
            description,
            activity_type,
            next_activity_date,
            final_deadline,
            day_period,
            scheduled_time,
            duration_hours,
            recurrence_rule,
            action_type,
            theme_organization,
            notify_before_minutes,
            notes,
            status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    const [result] = await pool.query(sql, [
        data.life_sphere,
        data.description,
        data.activity_type,
        data.next_activity_date,
        data.final_deadline,
        data.day_period,
        data.scheduled_time,
        data.duration_hours ?? null,
        data.recurrence_rule ?? null,
        data.action_type,
        data.theme_organization,
        data.notify_before_minutes,
        data.notes,
        data.status,
    ]);
    return result.insertId;
}

//------------------------------------------------
//                     UPDATE
//------------------------------------------------

async function updateActivity(id, data) {
    const sql = `
        UPDATE activity
        SET
            life_sphere = ?,
            description = ?,
            activity_type = ?,
            next_activity_date = ?,
            final_deadline = ?,
            day_period = ?,
            scheduled_time = ?,
            duration_hours = ?,
            recurrence_rule = ?,
            action_type = ?,
            theme_organization = ?,
            notify_before_minutes = ?,
            notes = ?,
            status = ?
        WHERE id = ? AND excluded = 0
    `;
    const [result] = await pool.query(sql, [
        data.life_sphere,
        data.description,
        data.activity_type,
        data.next_activity_date,
        data.final_deadline,
        data.day_period,
        data.scheduled_time,
        data.duration_hours ?? null,
        data.recurrence_rule ?? null,
        data.action_type,
        data.theme_organization,
        data.notify_before_minutes,
        data.notes,
        data.status,
        id,
    ]);
    return result.affectedRows;
}

// Remarcação pelo calendário (arrastar e soltar): data e, se informado, o horário
async function updateNextActivitySchedule(id, nextActivityDate, scheduledTime) {
    const sql = `UPDATE activity SET next_activity_date = ?, scheduled_time = ? WHERE id = ? AND excluded = 0`;
    const [result] = await pool.query(sql, [nextActivityDate, scheduledTime, id]);
    return result.affectedRows;
}

// Pop-up de aviso: nova antecedência ("Notificar novamente em")
async function updateNotifyBefore(id, notifyBeforeMinutes) {
    const sql = `UPDATE activity SET notify_before_minutes = ? WHERE id = ? AND excluded = 0`;
    const [result] = await pool.query(sql, [notifyBeforeMinutes, id]);
    return result.affectedRows;
}

async function updateNextActivityDate(id, nextActivityDate) {
    const sql = `UPDATE activity SET next_activity_date = ? WHERE id = ? AND excluded = 0`;
    const [result] = await pool.query(sql, [nextActivityDate, id]);
    return result.affectedRows;
}

async function updateActivityStatus(id, status) {
    const sql = `UPDATE activity SET status = ? WHERE id = ? AND excluded = 0`;
    const [result] = await pool.query(sql, [status, id]);
    return result.affectedRows;
}

//------------------------------------------------
//                 DELETE (lógico)
//------------------------------------------------

async function deleteActivity(id) {
    const sql = `UPDATE activity SET excluded = 1 WHERE id = ? AND excluded = 0`;
    const [result] = await pool.query(sql, [id]);
    return result.affectedRows;
}

module.exports = {
    selectActivities,
    countActivities,
    selectActivityById,
    selectUpcomingReminders,
    updateNotifyBefore,
    selectActivitiesForCalendar,
    getActivityStats,
    getActivityDistribution,
    insertActivity,
    updateActivity,
    updateNextActivityDate,
    updateNextActivitySchedule,
    updateActivityStatus,
    deleteActivity,
};
