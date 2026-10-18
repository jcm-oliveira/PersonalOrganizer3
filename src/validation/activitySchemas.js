const { z } = require("zod");

const PAGE_SIZES = [10, 25, 50, 100];

const LIFE_SPHERES_WITH_COLORS = [
    { name: "Profissão e Carreira", color_code: "#007bff" },
    { name: "Família, Lazer e Social", color_code: "#28a745" },
    { name: "Saúde e Disposição", color_code: "#17a2b8" },
    { name: "Financeiro e Bens", color_code: "#ffc107" },
    { name: "Espiritualidade e Plenitude", color_code: "#6f42c1" },
    { name: "Desenvolvimento Pessoal", color_code: "#fd7e14" },
];

const LIFE_SPHERES = LIFE_SPHERES_WITH_COLORS.map((s) => s.name);

const RELEVANCE_OPTIONS = ["Prioridade", "Normal", "Baixa", "Backlog"];

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

// Filtros da listagem (Q + F)
const activityListQuerySchema = z.object({
    status: z
        .string()
        .trim()
        .refine(
            (val) =>
                val === STATUS_FILTER_ALL || val === STATUS_FILTER_VISIBLE || /^\d+$/.test(val),
            { message: "Status inválido." },
        )
        .catch(STATUS_FILTER_VISIBLE),
    search: z.string().trim().max(150).catch(""),
    lifeSphere: z.string().trim().catch(""),
    relevance: z.string().trim().catch(""),
    actionType: z.string().trim().catch(""),
    trafficLight: z.enum(["", "ATRASADA", "HOJE", "7_DIAS", "15_DIAS", "PRAZO"]).catch(""),
    page: z.coerce.number().int().min(1).catch(1),
    perPage: z.coerce
        .number()
        .refine((val) => PAGE_SIZES.includes(val))
        .catch(PAGE_SIZES[0]),
});

const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
const timeRegex = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;

const activityFormSchema = z.object({
    life_sphere: z
        .string({ error: "Informe a esfera da vida." })
        .trim()
        .min(1, "Informe a esfera da vida.")
        .max(100, "A esfera da vida deve ter no máximo 100 caracteres."),
    description: z
        .string({ error: "Informe a descrição da atividade." })
        .trim()
        .min(1, "Informe a descrição da atividade.")
        .max(255, "A descrição deve ter no máximo 255 caracteres."),
    relevance: z.string().trim().min(1, "Informe a relevância.").max(50).default("Prioridade"),
    next_activity_date: z
        .string({ error: "Informe a data da próxima atividade." })
        .trim()
        .regex(dateRegex, "Data da próxima atividade inválida (AAAA-MM-DD)."),
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

    let trafficLight = "NO_PRAZO";
    let trafficLightLabel = "NO PRAZO";
    let trafficLightClass = "badge-success";
    let dotColor = "#28a745"; // Verde

    if (daysNext !== null) {
        if (daysNext < 0) {
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
        next_activity_day_label: getNextActivityDayLabel(daysNext, referenceDate),
        traffic_light_class: trafficLightClass,
        traffic_light_dot_color: dotColor,
    };
}

module.exports = {
    PAGE_SIZES,
    DEFAULT_ACTIVITY_STATUS_ID,
    STATUS_FILTER_VISIBLE,
    STATUS_FILTER_ALL,
    LIFE_SPHERES_WITH_COLORS,
    LIFE_SPHERES,
    RELEVANCE_OPTIONS,
    DAY_PERIODS,
    ACTION_TYPES,
    THEME_ORGANIZATIONS,
    activityListQuerySchema,
    activityFormSchema,
    activityRescheduleSchema,
    activityStatusChangeSchema,
    calendarRangeQuerySchema,
    calendarRescheduleSchema,
    idParamSchema,
    toFieldErrors,
    calculateDaysDiff,
    toDateOnlyString,
    enrichActivity,
    getNextActivityDayLabel,
    getContrastTextColor,
};
