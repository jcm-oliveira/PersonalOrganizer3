const { z } = require("zod");

const PAGE_SIZES = [10, 25, 50, 100];

const lookupListQuerySchema = z.object({
    status: z.enum(["1", "0", "all"]).catch("1"),
    search: z.string().trim().max(150).catch(""),
    page: z.coerce.number().int().min(1).catch(1),
    perPage: z.coerce
        .number()
        .refine((val) => PAGE_SIZES.includes(val))
        .catch(PAGE_SIZES[0]),
});

const themeOrgListQuerySchema = z.object({
    status: z.enum(["1", "0", "all"]).catch("1"),
    search: z.string().trim().max(150).catch(""),
    lifeSphereId: z.string().trim().catch(""),
    page: z.coerce.number().int().min(1).catch(1),
    perPage: z.coerce
        .number()
        .refine((val) => PAGE_SIZES.includes(val))
        .catch(PAGE_SIZES[0]),
});

const hexColorRegex = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

const lifeSphereFormSchema = z.object({
    name: z
        .string({ error: "Informe o nome da esfera da vida." })
        .trim()
        .min(1, "Informe o nome da esfera da vida.")
        .max(100, "O nome deve ter no máximo 100 caracteres."),
    description: z
        .string()
        .trim()
        .max(2000, "A descrição deve ter no máximo 2000 caracteres.")
        .optional()
        .or(z.literal(""))
        .transform((val) => (val && val.trim() !== "" ? val.trim() : null)),
    color_code: z
        .string()
        .trim()
        .regex(hexColorRegex, "Cor inválida. Use o formato hexadecimal (#RRGGBB).")
        .default("#007bff"),
    status: z.enum(["0", "1"]).transform((val) => Number(val)),
});

const activityStatusFormSchema = z.object({
    name: z
        .string({ error: "Informe o nome do status." })
        .trim()
        .min(1, "Informe o nome do status.")
        .max(50, "O nome deve ter no máximo 50 caracteres."),
    description: z
        .string()
        .trim()
        .max(2000, "A descrição deve ter no máximo 2000 caracteres.")
        .optional()
        .or(z.literal(""))
        .transform((val) => (val && val.trim() !== "" ? val.trim() : null)),
    visibility: z.enum(["0", "1"]).transform((val) => Number(val)),
    color_code: z
        .string()
        .trim()
        .regex(hexColorRegex, "Cor inválida. Use o formato hexadecimal (#RRGGBB).")
        .default("#212529"),
    status: z.enum(["0", "1"]).transform((val) => Number(val)),
});

const simpleLookupFormSchema = (entityLabel, maxLength = 100) =>
    z.object({
        name: z
            .string({ error: `Informe o nome do(a) ${entityLabel.toLowerCase()}.` })
            .trim()
            .min(1, `Informe o nome do(a) ${entityLabel.toLowerCase()}.`)
            .max(maxLength, `O nome deve ter no máximo ${maxLength} caracteres.`),
        description: z
            .string()
            .trim()
            .max(2000, "A descrição deve ter no máximo 2000 caracteres.")
            .optional()
            .or(z.literal(""))
            .transform((val) => (val && val.trim() !== "" ? val.trim() : null)),
        status: z.enum(["0", "1"]).transform((val) => Number(val)),
    });

const themeOrganizationFormSchema = z.object({
    name: z
        .string({ error: "Informe o nome da organização por tema." })
        .trim()
        .min(1, "Informe o nome da organização por tema.")
        .max(150, "O nome deve ter no máximo 150 caracteres."),
    life_sphere_id: z
        .string()
        .trim()
        .optional()
        .or(z.literal(""))
        .transform((val) => {
            if (!val || val.trim() === "") return null;
            const parsed = Number(val);
            return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
        }),
    description: z
        .string()
        .trim()
        .max(2000, "A descrição deve ter no máximo 2000 caracteres.")
        .optional()
        .or(z.literal(""))
        .transform((val) => (val && val.trim() !== "" ? val.trim() : null)),
    status: z.enum(["0", "1"]).transform((val) => Number(val)),
});

function toFieldErrors(zodError) {
    const fieldErrors = {};
    if (!zodError || !zodError.issues) return fieldErrors;
    for (const issue of zodError.issues) {
        const field = issue.path[0];
        if (field && !fieldErrors[field]) {
            fieldErrors[field] = issue.message;
        }
    }
    return fieldErrors;
}

module.exports = {
    PAGE_SIZES,
    lookupListQuerySchema,
    themeOrgListQuerySchema,
    lifeSphereFormSchema,
    activityStatusFormSchema,
    simpleLookupFormSchema,
    themeOrganizationFormSchema,
    toFieldErrors,
};
