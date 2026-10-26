const { z } = require("zod");

const PAGE_SIZES = [10, 25, 50, 100];
// Notificação com antecedência (minutos antes do início da atividade)
const DEFAULT_NOTIFY_BEFORE_MINUTES = 15;
const NOTIFY_BEFORE_OPTIONS = [
    { minutes: 0, label: "Na hora da atividade" },
    { minutes: 15, label: "15 minutos" },
    { minutes: 30, label: "30 minutos" },
    { minutes: 60, label: "1 hora" },
    { minutes: 120, label: "2 horas" },
    { minutes: 180, label: "3 horas" },
    { minutes: 240, label: "4 horas" },
    { minutes: 300, label: "5 horas" },
    { minutes: 1440, label: "1 dia" },
    { minutes: 2880, label: "2 dias" },
    { minutes: 4320, label: "3 dias" },
    { minutes: 5760, label: "4 dias" },
    { minutes: 7200, label: "5 dias" },
];
// Maior antecedência, em dias: limita a busca dos avisos
const NOTIFY_BEFORE_MAX_DAYS = 5;
// Atividade com horário fica atrasada (farol) 5 min após o início, quando o aviso some
const OVERDUE_GRACE_MINUTES = 5;

// Consulta de atividades abre com 50 itens por página
const DEFAULT_PAGE_SIZE = 50;

const LIFE_SPHERES_WITH_COLORS = [
    { name: "Profissão e Carreira", color_code: "#007bff" },
    { name: "Família, Lazer e Social", color_code: "#28a745" },
    { name: "Saúde e Disposição", color_code: "#17a2b8" },
    { name: "Financeiro e Bens", color_code: "#ffc107" },
    { name: "Espiritualidade e Plenitude", color_code: "#6f42c1" },
    { name: "Desenvolvimento Pessoal", color_code: "#fd7e14" },
];

const LIFE_SPHERES = LIFE_SPHERES_WITH_COLORS.map((s) => s.name);

// Tipos de Atividade que definem os blocos da consulta (ver migração 013).
// "Programada" fica à esquerda, junto com qualquer outro tipo; os demais, à direita.
const ACTIVITY_TYPE_PROGRAMMED = "Programada";
const ACTIVITY_TYPE_SERVICE_ORDER = "Ordem de Serviço";
const ACTIVITY_TYPE_SHOPPING_LIST = "Lista de Compras";
const ACTIVITY_TYPE_OPTIONS = [
    ACTIVITY_TYPE_PROGRAMMED,
    ACTIVITY_TYPE_SERVICE_ORDER,
    ACTIVITY_TYPE_SHOPPING_LIST,
];
// Tipos sem data: ao receber uma data, a atividade passa a ser "Programada"
const UNDATED_ACTIVITY_TYPES = [ACTIVITY_TYPE_SERVICE_ORDER, ACTIVITY_TYPE_SHOPPING_LIST];

const DAY_PERIODS = ["1 - Manhã", "2 - Tarde", "3 - Noite"];

const ACTION_TYPES = [
    "Compromisso",
    "Tarefa",
    "Reunião",
    "Arquitetura de Solução",
    "Acompanhamento",
    "Ligação / Mensagem",
    "Estudo / Leitura",
];

const THEME_ORGANIZATIONS = [
    "[TI] - Escritório de Projetos",
    "[TI] - Sustentação e Suporte",
    "[Gestão] - Reuniões e Governança",
    "[Família] - Casa e Família",
    "[Saúde] - Consultas e Exames",
    "[Finanças] - Orçamento e Contas",
    "[Espiritual] - Reuniões e Deveres",
    "[Estudos] - Cursos e Certificações",
];

// Registro 1 do cadastro de Status de Atividade: padrão de toda atividade nova
const DEFAULT_ACTIVITY_STATUS_ID = 1;

// Filtro de status padrão: status marcados como "visível por padrão" no cadastro
const STATUS_FILTER_VISIBLE = "visible";
const STATUS_FILTER_ALL = "all";

const statusFilterField = z
    .string()
    .trim()
    .refine(
        (val) => val === STATUS_FILTER_ALL || val === STATUS_FILTER_VISIBLE || /^\d+$/.test(val),
        { message: "Status inválido." },
    )
    .catch(STATUS_FILTER_VISIBLE);
const pageField = z.coerce.number().int().min(1).catch(1);
const perPageField = z.coerce
    .number()
    .refine((val) => PAGE_SIZES.includes(val))
    .catch(DEFAULT_PAGE_SIZE);

// Filtros da listagem (Q + F): bloco Atividades Programadas da consulta e tela com
// todas as atividades
const activityListQuerySchema = z.object({
    status: statusFilterField,
    search: z.string().trim().max(150).catch(""),
    lifeSphere: z.string().trim().catch(""),
    activityType: z.string().trim().catch(""),
    actionType: z.string().trim().catch(""),
    trafficLight: z.enum(["", "ATRASADA", "HOJE", "7_DIAS", "15_DIAS", "PRAZO"]).catch(""),
    page: pageField,
    perPage: perPageField,
});

// Filtro próprio dos blocos sem data da consulta (Ordem de Serviço e Lista de Compras).
// Na URL, cada campo leva o prefixo do bloco (ex.: serviceSearch, shoppingStatus) e a
// página é page + bloco (pageService, pageShopping). Ver parseBlockFilter.
const BLOCK_FILTER_FIELDS = ["status", "search", "lifeSphere", "themeOrganization", "perPage"];
const blockFilterSchema = z.object({
    status: statusFilterField,
    search: z.string().trim().max(150).catch(""),
    lifeSphere: z.string().trim().catch(""),
    themeOrganization: z.string().trim().catch(""),
    page: pageField,
    perPage: perPageField,
});

const capitalize = (text) => text.charAt(0).toUpperCase() + text.slice(1);

/** Nome do parâmetro na URL de um campo do filtro de bloco (ex.: service + search) */
function blockParamName(prefix, field) {
    return field === "page" ? `page${capitalize(prefix)}` : `${prefix}${capitalize(field)}`;
}

/** Lê da URL o filtro de um bloco sem data (campos com o prefixo do bloco) */
function parseBlockFilter(query, prefix) {
    const raw = {};
    [...BLOCK_FILTER_FIELDS, "page"].forEach((field) => {
        const value = query?.[blockParamName(prefix, field)];
        if (value !== undefined) raw[field] = value;
    });
    return blockFilterSchema.parse(raw);
}

const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
const timeRegex = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;

const activityFormSchema = z.object({
    life_sphere: z
        .string({ error: "Informe a esfera da vida." })
        .trim()
        .min(1, "Informe a esfera da vida.")
        .max(100, "A esfera da vida deve ter no máximo 100 caracteres."),
    description: z
        .string({ error: "Informe o nome da atividade." })
        .trim()
        .min(1, "Informe o nome da atividade.")
        .max(255, "O nome deve ter no máximo 255 caracteres."),
    activity_type: z
        .string()
        .trim()
        .min(1, "Informe o tipo de atividade.")
        .max(50)
        .default(ACTIVITY_TYPE_PROGRAMMED),
    next_activity_date: z
        .string()
        .trim()
        .regex(dateRegex, "Data da próxima atividade inválida (AAAA-MM-DD).")
        .optional()
        .or(z.literal(""))
        .transform((val) => (val && val.trim() !== "" ? val.trim() : null)),
    final_deadline: z
        .string()
        .trim()
        .regex(dateRegex, "Prazo final inválido (AAAA-MM-DD).")
        .optional()
        .or(z.literal(""))
        .transform((val) => (val && val.trim() !== "" ? val.trim() : null)),
    day_period: z
        .string()
        .trim()
        .max(50)
        .optional()
        .or(z.literal(""))
        .transform((val) => (val && val.trim() !== "" ? val.trim() : null)),
    scheduled_time: z
        .string()
        .trim()
        .regex(timeRegex, "Horário inválido (HH:MM).")
        .optional()
        .or(z.literal(""))
        .transform((val) => {
            if (!val || val.trim() === "") return null;
            const parts = val.trim().split(":");
            return `${parts[0].padStart(2, "0")}:${parts[1].padStart(2, "0")}:00`;
        }),
    // Duração em horas (aceita vírgula: "1,5"), em passos de 15 minutos
    duration_hours: z
        .string()
        .trim()
        .optional()
        .transform((val) => (val ? val.replace(",", ".") : ""))
        .refine((val) => val === "" || /^\d{1,2}(\.\d{1,2})?$/.test(val), {
            message: "Duração inválida (em horas, ex.: 1,5).",
        })
        .transform((val) => (val === "" ? null : Number(val)))
        .refine((val) => val === null || (val > 0 && val <= 24), {
            message: "A duração deve ser maior que zero e de até 24 horas.",
        })
        .refine((val) => val === null || Number.isInteger(val * 4), {
            message: "Use frações de 15 minutos (ex.: 0,25 · 0,5 · 1,75).",
        }),
    action_type: z
        .string()
        .trim()
        .max(100)
        .optional()
        .or(z.literal(""))
        .transform((val) => (val && val.trim() !== "" ? val.trim() : null)),
    theme_organization: z
        .string()
        .trim()
        .max(150)
        .optional()
        .or(z.literal(""))
        .transform((val) => (val && val.trim() !== "" ? val.trim() : null)),
    notify_before_minutes: z
        .string()
        .trim()
        .optional()
        .transform((val) => (val ? Number(val) : DEFAULT_NOTIFY_BEFORE_MINUTES))
        .refine((val) => NOTIFY_BEFORE_OPTIONS.some((opt) => opt.minutes === val), {
            message: "Selecione uma antecedência válida para a notificação.",
        }),
    notes: z
        .string()
        .trim()
        .max(5000)
        .optional()
        .or(z.literal(""))
        .transform((val) => (val && val.trim() !== "" ? val.trim() : null)),
    status: z.coerce.number().int().catch(DEFAULT_ACTIVITY_STATUS_ID),
});

// Pop-up "Remarcar atividade" (Q)
const activityRescheduleSchema = z.object({
    next_activity_date: z
        .string({ error: "Informe a nova data da próxima atividade." })
        .trim()
        .regex(dateRegex, "Data da próxima atividade inválida (AAAA-MM-DD)."),
});

// Pop-up "Status da atividade" (Q)
const activityStatusChangeSchema = z.object({
    status: z.coerce.number({ error: "Selecione o status." }).int().min(0),
});

// Intervalo pedido pelo calendário (FullCalendar envia ISO, ex.: 2026-09-27T00:00:00-03:00)
const CALENDAR_MAX_RANGE_DAYS = 400;
const calendarDate = z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}/, "Data inválida.")
    .transform((val) => val.slice(0, 10));

const calendarRangeQuerySchema = z
    .object({
        start: calendarDate,
        end: calendarDate,
        status: activityListQuerySchema.shape.status,
    })
    .refine(({ start, end }) => start < end, { message: "Intervalo inválido." })
    .refine(
        ({ start, end }) =>
            (Date.parse(end) - Date.parse(start)) / (24 * 60 * 60 * 1000) <=
            CALENDAR_MAX_RANGE_DAYS,
        { message: "Intervalo muito grande." },
    );

// Remarcação pelo calendário (arrastar e soltar). Sem horário = mantém o horário atual.
const calendarRescheduleSchema = z.object({
    next_activity_date: z
        .string({ error: "Informe a nova data da próxima atividade." })
        .trim()
        .regex(dateRegex, "Data da próxima atividade inválida (AAAA-MM-DD)."),
    scheduled_time: z
        .string()
        .trim()
        .regex(timeRegex, "Horário inválido (HH:MM).")
        .optional()
        .nullable(),
});

// Pop-up de aviso: "Notificar novamente em" (nova antecedência da atividade)
const activityNotifyBeforeSchema = z.object({
    notify_before_minutes: z.coerce
        .number({ error: "Selecione quando notificar novamente." })
        .int()
        .refine((val) => NOTIFY_BEFORE_OPTIONS.some((opt) => opt.minutes === val), {
            message: "Selecione uma antecedência válida para a notificação.",
        }),
});

const idParamSchema = z.coerce.number().int().positive();

function toFieldErrors(zodError) {
    const errors = {};
    for (const issue of zodError.issues) {
        const field = issue.path[0];
        errors[field] ??= issue.message;
    }
    return errors;
}

/**
 * Converte uma data (string "YYYY-MM-DD..." ou Date) para "YYYY-MM-DD" no horário LOCAL.
 * Não usar toISOString(): ele converte para UTC e, no Brasil (UTC-3), após as 21h
 * já retorna o dia seguinte.
 */
function toDateOnlyString(value) {
    if (!value) return null;
    if (typeof value === "string") return value.slice(0, 10);
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    const pad = (n) => String(n).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** "YYYY-MM-DD" -> "dd/mm/aaaa" (null quando não houver data) */
function formatDateBr(dateStr) {
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateStr || "");
    return match ? `${match[3]}/${match[2]}/${match[1]}` : null;
}

/** 15 -> "15 minutos antes" | 0 -> "Na hora da atividade" (padrão quando não houver valor) */
function formatNotifyBefore(minutes) {
    const value =
        minutes === null || minutes === undefined || minutes === ""
            ? DEFAULT_NOTIFY_BEFORE_MINUTES
            : Number(minutes);
    if (value === 0) return "Na hora da atividade";
    const option = NOTIFY_BEFORE_OPTIONS.find((opt) => opt.minutes === value);
    return `${option ? option.label : `${value} minutos`} antes`;
}

/** Duração em minutos (o MySQL devolve DECIMAL como texto, ex.: "1.50"); null se não houver */
function durationToMinutes(durationHours) {
    const hours = Number(durationHours);
    return durationHours === null || durationHours === undefined || !(hours > 0)
        ? null
        : Math.round(hours * 60);
}

/** 1.5 -> "1h30" | 2 -> "2h" | 0.75 -> "45min" (null quando não houver duração) */
function formatDuration(durationHours) {
    const minutes = durationToMinutes(durationHours);
    if (minutes === null) return null;
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    if (h === 0) return `${m}min`;
    return m === 0 ? `${h}h` : `${h}h${String(m).padStart(2, "0")}`;
}

/**
 * Término = data e horário de início + duração ("YYYY-MM-DDTHH:MM:SS"). Calculado em UTC
 * só como aritmética de calendário, para passar da meia-noite sem efeito de fuso.
 */
function addDurationToDateTime(dateStr, timeStr, durationHours) {
    const minutes = durationToMinutes(durationHours);
    const date = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateStr || "");
    const time = /^(\d{2}):(\d{2})/.exec(timeStr || "");
    if (minutes === null || !date || !time) return null;
    const start = Date.UTC(date[1], date[2] - 1, date[3], time[1], time[2]);
    return new Date(start + minutes * 60 * 1000).toISOString().slice(0, 19);
}

/**
 * Referência do farol "atrasada": a data de hoje e o horário-limite de início
 * (agora - 5 min). Atividade de hoje que começou até esse horário já está atrasada.
 * Logo após a meia-noite o limite cairia no dia anterior: overdueTime = null.
 */
function getOverdueReference(now = new Date()) {
    const ref = new Date(now);
    const cutoff = new Date(ref.getTime() - OVERDUE_GRACE_MINUTES * 60 * 1000);
    const todayStr = toDateOnlyString(ref);
    const pad = (n) => String(n).padStart(2, "0");
    return {
        todayStr,
        overdueTime:
            toDateOnlyString(cutoff) === todayStr
                ? `${pad(cutoff.getHours())}:${pad(cutoff.getMinutes())}:${pad(cutoff.getSeconds())}`
                : null,
    };
}

/**
 * Calcula a diferença em dias entre uma data e a data de referência (hoje).
 * Retorna número inteiro de dias (positivo = futuro, 0 = hoje, negativo = atrasado).
 */
function calculateDaysDiff(targetDateStr, referenceDate = new Date()) {
    // new Date("YYYY-MM-DD") é interpretado como meia-noite UTC, o que no Brasil
    // cai no dia anterior. Por isso a data é lida pelos seus componentes.
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(toDateOnlyString(targetDateStr) || "");
    if (!match) return null;

    const ref = new Date(referenceDate);
    // Zera os horários para cálculo exato em dias corridos
    const targetUtc = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    const refUtc = Date.UTC(ref.getFullYear(), ref.getMonth(), ref.getDate());

    const msPerDay = 1000 * 60 * 60 * 24;
    return Math.floor((targetUtc - refUtc) / msPerDay);
}

/**
 * Retorna a cor de texto (escura ou clara) com melhor contraste sobre a cor de fundo informada
 */
function getContrastTextColor(hexColor) {
    const match = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(hexColor || "").trim());
    if (!match) return null;

    let hex = match[1];
    if (hex.length === 3) {
        hex = hex
            .split("")
            .map((c) => c + c)
            .join("");
    }

    const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
    const toLinear = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
    const luminance = 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);

    return luminance > 0.179 ? "#212529" : "#ffffff";
}

const WEEKDAY_LABELS = ["DOMINGO", "SEGUNDA", "TERÇA", "QUARTA", "QUINTA", "SEXTA", "SÁBADO"];

/**
 * Rótulo da coluna "Dia Próx.", conforme a regra da planilha:
 * < 0 ATRASADO | 0 HOJE | 1 AMANHÃ | 2 a 15 dia da semana (HOJE() + dias) | > 15 MAIS DE 15 DIAS
 */
function getNextActivityDayLabel(daysNext, referenceDate = new Date()) {
    if (daysNext === null || daysNext === undefined) return "-";
    if (daysNext < 0) return "ATRASADO";
    if (daysNext === 0) return "HOJE";
    if (daysNext === 1) return "AMANHÃ";
    if (daysNext <= 15) {
        const ref = new Date(referenceDate);
        const refUtc = Date.UTC(ref.getFullYear(), ref.getMonth(), ref.getDate());
        const targetDay = new Date(refUtc + daysNext * 24 * 60 * 60 * 1000).getUTCDay();
        return WEEKDAY_LABELS[targetDay];
    }
    return "MAIS DE 15 DIAS";
}

/**
 * Enriquece uma atividade com campos calculados de farol, dias restantes e resumo
 */
function enrichActivity(activity, referenceDate = new Date()) {
    const nextDate = toDateOnlyString(activity.next_activity_date);
    const finalDate = toDateOnlyString(activity.final_deadline);

    const daysNext = calculateDaysDiff(nextDate, referenceDate);
    const daysFinal = calculateDaysDiff(finalDate, referenceDate);

    // Hoje, com horário: atrasada 5 min após o início (quando o pop-up de aviso some)
    const startTime = activity.scheduled_time ? String(activity.scheduled_time).slice(0, 8) : null;
    const { overdueTime } = getOverdueReference(referenceDate);
    const lateToday =
        daysNext === 0 && Boolean(startTime && overdueTime && startTime <= overdueTime);
    // Momento em que passa a atrasada (atualização do farol na tela, sem recarregar)
    const overdueAt =
        daysNext !== null && daysNext >= 0 && !lateToday && startTime
            ? addDurationToDateTime(nextDate, startTime, OVERDUE_GRACE_MINUTES / 60)
            : null;

    let trafficLight = "NO_PRAZO";
    let trafficLightLabel = "NO PRAZO";
    let trafficLightClass = "badge-success";
    let dotColor = "#28a745"; // Verde

    if (daysNext === null) {
        // Sem data marcada: farol neutro
        trafficLightClass = "badge-secondary";
        dotColor = "#adb5bd"; // Cinza
    } else if (daysNext < 0 || lateToday) {
        trafficLight = "ATRASADA";
        trafficLightLabel = "ATRASADA";
        trafficLightClass = "badge-danger";
        dotColor = "#343a40"; // Preto/cinza escuro como na imagem
    } else if (daysNext === 0) {
        trafficLight = "HOJE";
        trafficLightLabel = "HOJE";
        trafficLightClass = "badge-danger";
        dotColor = "#dc3545"; // Vermelho
    } else if (daysNext <= 7) {
        trafficLight = "7_DIAS";
        trafficLightLabel = "PRÓX. 7 DIAS";
        trafficLightClass = "badge-warning";
        dotColor = "#fd7e14"; // Laranja
    } else if (daysNext <= 15) {
        trafficLight = "15_DIAS";
        trafficLightLabel = "ENTRE 7 E 15 DIAS";
        trafficLightClass = "badge-warning";
        dotColor = "#ffc107"; // Amarelo
    }

    return {
        ...activity,
        next_activity_date_formatted: nextDate,
        final_deadline_formatted: finalDate,
        // Para exibição: dd/mm/aaaa
        next_activity_date_br: formatDateBr(nextDate),
        final_deadline_br: formatDateBr(finalDate),
        days_next_activity: daysNext,
        days_final_deadline: daysFinal,
        traffic_light: trafficLight,
        traffic_light_label: trafficLightLabel,
        next_activity_day_label: lateToday
            ? "ATRASADO"
            : getNextActivityDayLabel(daysNext, referenceDate),
        traffic_light_class: trafficLightClass,
        traffic_light_dot_color: dotColor,
        overdue_at: overdueAt,
        // Duração e horário de término (HH:MM), quando houver horário e duração.
        // Só o horário interessa, então qualquer data serve de base para a soma.
        duration_label: formatDuration(activity.duration_hours),
        notify_before_label: formatNotifyBefore(activity.notify_before_minutes),
        scheduled_end_time:
            addDurationToDateTime(
                "2000-01-01",
                activity.scheduled_time,
                activity.duration_hours,
            )?.slice(11, 16) ?? null,
    };
}

module.exports = {
    PAGE_SIZES,
    DEFAULT_PAGE_SIZE,
    DEFAULT_NOTIFY_BEFORE_MINUTES,
    NOTIFY_BEFORE_OPTIONS,
    NOTIFY_BEFORE_MAX_DAYS,
    DEFAULT_ACTIVITY_STATUS_ID,
    STATUS_FILTER_VISIBLE,
    STATUS_FILTER_ALL,
    LIFE_SPHERES_WITH_COLORS,
    LIFE_SPHERES,
    ACTIVITY_TYPE_PROGRAMMED,
    ACTIVITY_TYPE_SERVICE_ORDER,
    ACTIVITY_TYPE_SHOPPING_LIST,
    UNDATED_ACTIVITY_TYPES,
    ACTIVITY_TYPE_OPTIONS,
    DAY_PERIODS,
    ACTION_TYPES,
    THEME_ORGANIZATIONS,
    activityListQuerySchema,
    BLOCK_FILTER_FIELDS,
    blockParamName,
    parseBlockFilter,
    activityFormSchema,
    activityRescheduleSchema,
    activityStatusChangeSchema,
    calendarRangeQuerySchema,
    calendarRescheduleSchema,
    activityNotifyBeforeSchema,
    idParamSchema,
    toFieldErrors,
    calculateDaysDiff,
    toDateOnlyString,
    formatDuration,
    addDurationToDateTime,
    getOverdueReference,
    enrichActivity,
    getNextActivityDayLabel,
    getContrastTextColor,
};
