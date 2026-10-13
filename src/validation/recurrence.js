// Atividade recorrente: regra no padrão iCalendar (RFC 5545 RRULE), calculada com a
// biblioteca rrule (https://github.com/jkbrzt/rrule). A série começa na data da
// próxima atividade; a regra é gravada sem o prefixo "RRULE:" (ex.: "FREQ=MONTHLY;BYMONTHDAY=15").
//
// As datas são tratadas como dias de calendário, em UTC (meia-noite), para não
// sofrer deslocamento de fuso horário.
const { z } = require("zod");
const { RRule } = require("rrule");

const FREQUENCIES = {
    DAILY: RRule.DAILY,
    WEEKLY: RRule.WEEKLY,
    MONTHLY: RRule.MONTHLY,
    YEARLY: RRule.YEARLY,
};

const WEEKDAYS = [
    { code: "MO", label: "segunda", plural: "segundas", rrule: RRule.MO },
    { code: "TU", label: "terça", plural: "terças", rrule: RRule.TU },
    { code: "WE", label: "quarta", plural: "quartas", rrule: RRule.WE },
    { code: "TH", label: "quinta", plural: "quintas", rrule: RRule.TH },
    { code: "FR", label: "sexta", plural: "sextas", rrule: RRule.FR },
    { code: "SA", label: "sábado", plural: "sábados", rrule: RRule.SA },
    { code: "SU", label: "domingo", plural: "domingos", rrule: RRule.SU },
];
const WEEKDAY_BY_CODE = new Map(WEEKDAYS.map((w) => [w.code, w]));
const WEEKDAY_BY_INDEX = new Map(WEEKDAYS.map((w) => [w.rrule.weekday, w]));

const SETPOS_LABELS = { 1: "1º", 2: "2º", 3: "3º", 4: "4º", "-1": "último" };

// Limite de segurança ao expandir ocorrências (ex.: série diária de muitos anos)
const MAX_OCCURRENCES = 1000;

const dateRegex = /^\d{4}-\d{2}-\d{2}$/;

function toUtcDate(dateStr) {
    const [y, m, d] = dateStr.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, d));
}

function toDateStr(date) {
    return date.toISOString().slice(0, 10);
}

function formatDateBr(dateStr) {
    const [y, m, d] = dateStr.split("-");
    return `${d}/${m}/${y}`;
}

const optionalText = z
    .string()
    .trim()
    .optional()
    .transform((val) => (val ? val : undefined));

// Campos "recurrence_*" do formulário de atividade
const recurrenceFormSchema = z
    .object({
        recurrence_freq: z.enum(["", "DAILY", "WEEKLY", "MONTHLY", "YEARLY"]).catch(""),
        recurrence_interval: z.coerce.number().int().min(1).max(99).catch(1),
        recurrence_weekdays: z
            .union([z.string(), z.array(z.string())])
            .optional()
            .transform((val) => (val === undefined ? [] : [].concat(val)))
            .pipe(z.array(z.enum(WEEKDAYS.map((w) => w.code)))),
        recurrence_monthly_mode: z.enum(["day", "weekday"]).catch("day"),
        recurrence_month_day: z.coerce
            .number()
            .int()
            .refine((val) => val === -1 || (val >= 1 && val <= 31))
            .catch(1),
        recurrence_setpos: z.coerce
            .number()
            .int()
            .refine((val) => [1, 2, 3, 4, -1].includes(val))
            .catch(1),
        recurrence_setpos_weekday: z.enum(WEEKDAYS.map((w) => w.code)).catch("MO"),
        recurrence_end: z.enum(["never", "until", "count"]).catch("never"),
        recurrence_until: optionalText,
        recurrence_count: z.coerce.number().int().min(1).max(999).catch(10),
    })
    .superRefine((val, ctx) => {
        if (val.recurrence_freq === "WEEKLY" && val.recurrence_weekdays.length === 0) {
            ctx.addIssue({
                code: "custom",
                path: ["recurrence"],
                message: "Selecione ao menos um dia da semana.",
            });
        }
        if (
            val.recurrence_freq &&
            val.recurrence_end === "until" &&
            !dateRegex.test(val.recurrence_until || "")
        ) {
            ctx.addIssue({
                code: "custom",
                path: ["recurrence"],
                message: "Informe a data de término da repetição.",
            });
        }
    });

/**
 * Monta a regra a partir dos campos do formulário e alinha a data de início com a
 * primeira ocorrência válida (ex.: "todo dia 15" informado no dia 13 começa no dia 15).
 * Um término por quantidade (COUNT) é convertido em data final (UNTIL), para que a
 * série continue correta quando a próxima atividade avançar.
 * Retorna { rule, nextActivityDate } ou { error }.
 */
function buildRecurrence(body, startDateStr) {
    const parsed = recurrenceFormSchema.safeParse(body ?? {});
    if (!parsed.success) {
        return { error: parsed.error.issues[0]?.message || "Recorrência inválida." };
    }
    const f = parsed.data;
    if (!f.recurrence_freq) {
        return { rule: null, nextActivityDate: startDateStr };
    }

    const options = {
        freq: FREQUENCIES[f.recurrence_freq],
        interval: f.recurrence_interval,
        dtstart: toUtcDate(startDateStr),
    };
    if (f.recurrence_freq === "WEEKLY") {
        options.byweekday = f.recurrence_weekdays.map((code) => WEEKDAY_BY_CODE.get(code).rrule);
    }
    if (f.recurrence_freq === "MONTHLY") {
        if (f.recurrence_monthly_mode === "weekday") {
            options.byweekday = [WEEKDAY_BY_CODE.get(f.recurrence_setpos_weekday).rrule];
            options.bysetpos = [f.recurrence_setpos];
        } else {
            options.bymonthday = [f.recurrence_month_day];
        }
    }
    if (f.recurrence_end === "until") {
        if (f.recurrence_until < startDateStr) {
            return { error: "A data de término deve ser igual ou posterior à próxima atividade." };
        }
        options.until = toUtcDate(f.recurrence_until);
    }

    let rrule = new RRule(options);
    if (f.recurrence_end === "count") {
        const occurrences = rrule.all((_, i) => i < f.recurrence_count);
        if (occurrences.length === 0) {
            return { error: "A repetição não gera nenhuma ocorrência." };
        }
        rrule = new RRule({ ...options, until: occurrences[occurrences.length - 1] });
    }

    const first = rrule.after(options.dtstart, true);
    if (!first) {
        return { error: "A repetição não gera nenhuma ocorrência a partir da próxima atividade." };
    }
    return { rule: ruleBody(rrule), nextActivityDate: toDateStr(first) };
}

// Só a linha RRULE (sem DTSTART), sem o prefixo "RRULE:"
function ruleBody(rrule) {
    const options = { ...rrule.origOptions };
    delete options.dtstart;
    return RRule.optionsToString(options).replace(/^RRULE:/, "");
}

function parseRule(rule, startDateStr) {
    if (!rule) return null;
    try {
        const options = RRule.parseString(rule);
        return new RRule({ ...options, dtstart: toUtcDate(startDateStr) });
    } catch {
        return null;
    }
}

/** Próxima ocorrência depois da data informada (exclusiva), ou null se a série acabou. */
function nextOccurrence(rule, currentDateStr) {
    const rrule = parseRule(rule, currentDateStr);
    if (!rrule) return null;
    const next = rrule.after(toUtcDate(currentDateStr), false);
    return next ? toDateStr(next) : null;
}

/** Ocorrências a partir da data de início, dentro de [from, to). */
function occurrencesBetween(rule, startDateStr, fromStr, toStr) {
    const rrule = parseRule(rule, startDateStr);
    if (!rrule) return [];
    const from = toUtcDate(fromStr > startDateStr ? fromStr : startDateStr);
    const to = new Date(toUtcDate(toStr).getTime() - 1);
    if (to < from) return [];
    return rrule.between(from, to, true, (_, i) => i < MAX_OCCURRENCES).map(toDateStr);
}

/** Valores do formulário a partir da regra gravada (para a tela de edição). */
function ruleToFormValues(rule) {
    const empty = { recurrence_freq: "" };
    if (!rule) return empty;
    let options;
    try {
        options = RRule.parseString(rule);
    } catch {
        return empty;
    }
    const freq = Object.keys(FREQUENCIES).find((k) => FREQUENCIES[k] === options.freq);
    if (!freq) return empty;

    const weekdays = [].concat(options.byweekday || []).map((w) => WEEKDAY_BY_INDEX.get(w.weekday));
    const values = {
        recurrence_freq: freq,
        recurrence_interval: String(options.interval || 1),
        recurrence_weekdays: weekdays.map((w) => w.code),
        recurrence_end: options.until ? "until" : "never",
        recurrence_until: options.until ? toDateStr(options.until) : "",
    };
    if (freq === "MONTHLY") {
        const setpos = [].concat(options.bysetpos || [])[0];
        if (setpos !== undefined && weekdays.length > 0) {
            values.recurrence_monthly_mode = "weekday";
            values.recurrence_setpos = String(setpos);
            values.recurrence_setpos_weekday = weekdays[0].code;
        } else {
            values.recurrence_monthly_mode = "day";
            values.recurrence_month_day = String([].concat(options.bymonthday || [1])[0]);
        }
    }
    return values;
}

function joinPt(items) {
    if (items.length <= 1) return items.join("");
    return `${items.slice(0, -1).join(", ")} e ${items[items.length - 1]}`;
}

/** Descrição em português, ex.: "Todo mês, no 2º sábado" ou "A cada 2 semanas, às segundas". */
function describeRecurrence(rule) {
    const values = ruleToFormValues(rule);
    if (!values.recurrence_freq) return null;
    const n = Number(values.recurrence_interval);
    const every = {
        DAILY: n === 1 ? "Todo dia" : `A cada ${n} dias`,
        WEEKLY: n === 1 ? "Toda semana" : `A cada ${n} semanas`,
        MONTHLY: n === 1 ? "Todo mês" : `A cada ${n} meses`,
        YEARLY: n === 1 ? "Todo ano" : `A cada ${n} anos`,
    }[values.recurrence_freq];

    let detail = "";
    if (values.recurrence_freq === "WEEKLY") {
        const days = values.recurrence_weekdays.map((code) => WEEKDAY_BY_CODE.get(code).plural);
        detail = `, às ${joinPt(days)}`;
    } else if (values.recurrence_freq === "MONTHLY") {
        if (values.recurrence_monthly_mode === "weekday") {
            const day = WEEKDAY_BY_CODE.get(values.recurrence_setpos_weekday).label;
            detail = `, no ${SETPOS_LABELS[values.recurrence_setpos]} ${day}`;
        } else {
            detail =
                values.recurrence_month_day === "-1"
                    ? ", no último dia"
                    : `, no dia ${values.recurrence_month_day}`;
        }
    }
    const until = values.recurrence_until ? `, até ${formatDateBr(values.recurrence_until)}` : "";
    return `${every}${detail}${until}`;
}

module.exports = {
    WEEKDAYS,
    recurrenceFormSchema,
    buildRecurrence,
    nextOccurrence,
    occurrencesBetween,
    ruleToFormValues,
    describeRecurrence,
};
