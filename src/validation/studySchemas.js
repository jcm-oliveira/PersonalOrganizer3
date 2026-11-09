const { z } = require("zod");

const PAGE_SIZES = [10, 25, 50, 100];
const STUDY_TYPES = ["Leitura", "Curso"];
// Situação do estudo: concluído = evolução de 100%
const SITUATIONS = ["open", "finished", "all"];
// Sugestões do campo "Fonte do material" (texto livre: aceita também um link)
const MATERIAL_SOURCES = [
    "Livro físico",
    "Livro digital",
    "PDF",
    "Curso em vídeo",
    "Curso presencial",
    "Site / Artigo",
];

const optionalText = (max, message) =>
    z
        .string()
        .trim()
        .max(max, message)
        .optional()
        .or(z.literal(""))
        .transform((val) => (val && val.trim() !== "" ? val.trim() : null));

const requiredText = (max, emptyMessage, maxMessage) =>
    z.string({ error: emptyMessage }).trim().min(1, emptyMessage).max(max, maxMessage);

// "YYYY-MM-DD" (campo type="date") ou vazio; confere se a data existe
const optionalDate = (label) =>
    z
        .string()
        .trim()
        .optional()
        .transform((val) => (val ? val : null))
        .refine((val) => {
            if (val === null) return true;
            const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(val);
            if (!match) return false;
            const date = new Date(Date.UTC(match[1], match[2] - 1, match[3]));
            return (
                date.getUTCFullYear() === Number(match[1]) &&
                date.getUTCMonth() === Number(match[2]) - 1 &&
                date.getUTCDate() === Number(match[3]) &&
                Number(match[1]) >= 1900 &&
                Number(match[1]) <= 2999
            );
        }, `Informe uma data de ${label} válida.`);

const listQuerySchema = z.object({
    situation: z.enum(SITUATIONS).catch("all"),
    type: z.enum([...STUDY_TYPES, "all"]).catch("all"),
    search: z.string().trim().max(150).catch(""),
    area: z.string().trim().max(150).catch(""),
    page: z.coerce.number().int().min(1).catch(1),
    perPage: z.coerce
        .number()
        .refine((val) => PAGE_SIZES.includes(val))
        .catch(PAGE_SIZES[1]),
});

// Ids enviados por checkboxes (um valor vira string; vários, array)
const idList = z
    .union([z.string(), z.array(z.string())])
    .optional()
    .transform((val) => [
        ...new Set(
            []
                .concat(val ?? [])
                .map(Number)
                .filter((n) => Number.isInteger(n) && n > 0),
        ),
    ]);

const studyFormSchema = z
    .object({
        knowledge_area: requiredText(
            150,
            "Informe a área de conhecimento.",
            "A área de conhecimento deve ter no máximo 150 caracteres.",
        ),
        subject: optionalText(150, "O assunto deve ter no máximo 150 caracteres."),
        name: requiredText(
            255,
            "Informe o nome do livro ou curso.",
            "O nome deve ter no máximo 255 caracteres.",
        ),
        author: optionalText(255, "A instituição/autor deve ter no máximo 255 caracteres."),
        study_type: z.enum(STUDY_TYPES, { error: "Selecione o tipo (Leitura ou Curso)." }),
        hours: z
            .string()
            .trim()
            .optional()
            .transform((val) => (val ? val.replace(",", ".") : null))
            .refine(
                (val) => val === null || /^\d{1,5}(\.\d)?$/.test(val),
                "Informe as horas com no máximo uma casa decimal (ex.: 12,5).",
            )
            .transform((val) => (val === null ? null : Number(val))),
        has_certificate: z
            .string()
            .optional()
            .transform((val) => (val === "1" ? 1 : 0)),
        material_source: optionalText(
            500,
            "A fonte do material deve ter no máximo 500 caracteres.",
        ),
        stop_point: optionalText(255, "O ponto de parada deve ter no máximo 255 caracteres."),
        progress: z.coerce
            .number({ error: "Informe a evolução entre 0 e 100%." })
            .int("Informe a evolução em número inteiro (0 a 100%).")
            .min(0, "A evolução deve estar entre 0 e 100%.")
            .max(100, "A evolução deve estar entre 0 e 100%."),
        start_date: optionalDate("início"),
        end_date: optionalDate("término"),
        notes: optionalText(100000, "As anotações devem ter no máximo 100.000 caracteres."),
        remove_attachments: idList,
    })
    .superRefine((val, ctx) => {
        if (val.start_date && val.end_date && val.end_date < val.start_date) {
            ctx.addIssue({
                code: "custom",
                path: ["end_date"],
                message: "A data de término não pode ser anterior à data de início.",
            });
        }
    });

const idParamSchema = z.coerce.number().int().positive();

function toFieldErrors(zodError) {
    const errors = {};
    for (const issue of zodError.issues) {
        const field = issue.path[0];
        if (field && !errors[field]) errors[field] = issue.message;
    }
    return errors;
}

module.exports = {
    PAGE_SIZES,
    STUDY_TYPES,
    MATERIAL_SOURCES,
    listQuerySchema,
    studyFormSchema,
    idParamSchema,
    toFieldErrors,
};
