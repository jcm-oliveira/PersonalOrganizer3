const { z } = require("zod");

const PAGE_SIZES = [10, 25, 50, 100];

const LIFE_SPHERES = [
    "Profissão e Carreira",
    "Família, Lazer e Social",
    "Saúde e Disposição",
    "Financeiro e Bens",
    "Espiritualidade e Plenitude",
    "Desenvolvimento Pessoal",
];

const RELEVANCE_OPTIONS = ["Prioridade", "Normal", "Baixa", "Backlog"];

const DAY_PERIODS = ["1 - Manhã", "2 - Tarde", "3 - Noite"];

const PERIODICITY_OPTIONS = [
    "Única",
    "Diária",
    "Semanal",
    "Quinzenal",
    "Mensal",
    "Bimestral",
    "Semestral",
    "Anual",
];

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

// Filtros da listagem (Q + F)
const activityListQuerySchema = z.object({
    status: z
        .string()
        .trim()
        .refine((val) => val === "all" || /^\d+$/.test(val), { message: "Status inválido." })
        .catch("1"),
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
    periodicity: z
        .string()
        .trim()
        .max(50)
        .optional()
        .or(z.literal(""))
        .transform((val) => (val && val.trim() !== "" ? val.trim() : null)),
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
    status: z.coerce.number().int().catch(1),
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
 * Calcula a diferença em dias entre uma data e a data de referência (hoje).
 * Retorna número inteiro de dias (positivo = futuro, negativo = atrasado).
 */
function calculateDaysDiff(targetDateStr, referenceDate = new Date()) {
    if (!targetDateStr) return null;
    const target = new Date(targetDateStr);
    if (Number.isNaN(target.getTime())) return null;

    const ref = new Date(referenceDate);
    // Zera os horários para cálculo exato em dias corridos
    const targetUtc = Date.UTC(target.getFullYear(), target.getMonth(), target.getDate());
    const refUtc = Date.UTC(ref.getFullYear(), ref.getMonth(), ref.getDate());

    const msPerDay = 1000 * 60 * 60 * 24;
    return Math.floor((targetUtc - refUtc) / msPerDay);
}

/**
 * Enriquece uma atividade com campos calculados de farol, dias restantes e resumo
 */
function enrichActivity(activity, referenceDate = new Date()) {
    const nextDate = activity.next_activity_date
        ? typeof activity.next_activity_date === "string"
            ? activity.next_activity_date.slice(0, 10)
            : new Date(activity.next_activity_date).toISOString().slice(0, 10)
        : null;

    const finalDate = activity.final_deadline
        ? typeof activity.final_deadline === "string"
            ? activity.final_deadline.slice(0, 10)
            : new Date(activity.final_deadline).toISOString().slice(0, 10)
        : null;

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
        days_next_activity: daysNext,
        days_final_deadline: daysFinal,
        traffic_light: trafficLight,
        traffic_light_label: trafficLightLabel,
        traffic_light_class: trafficLightClass,
        traffic_light_dot_color: dotColor,
    };
}

module.exports = {
    PAGE_SIZES,
    LIFE_SPHERES,
    RELEVANCE_OPTIONS,
    DAY_PERIODS,
    PERIODICITY_OPTIONS,
    ACTION_TYPES,
    THEME_ORGANIZATIONS,
    activityListQuerySchema,
    activityFormSchema,
    idParamSchema,
    toFieldErrors,
    calculateDaysDiff,
    enrichActivity,
};
