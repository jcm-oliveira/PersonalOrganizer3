const { z } = require("zod");

const PAGE_SIZES = [10, 25, 50];

// Filtros da listagem: valores inválidos voltam ao padrão em vez de gerar erro.
const listQuerySchema = z.object({
    status: z.enum(["1", "0", "all"]).catch("1"),
    search: z.string().trim().max(150).catch(""),
    page: z.coerce.number().int().min(1).catch(1),
    perPage: z.coerce
        .number()
        .refine((value) => PAGE_SIZES.includes(value))
        .catch(PAGE_SIZES[0]),
});

const exampleFormSchema = z.object({
    name: z
        .string({ error: "Informe o nome." })
        .trim()
        .min(1, "Informe o nome.")
        .max(150, "O nome deve ter no máximo 150 caracteres."),
    description: z
        .string()
        .trim()
        .max(5000, "A descrição deve ter no máximo 5000 caracteres.")
        .optional()
        .transform((value) => value || null),
    status: z.enum(["0", "1"], { error: "Status inválido." }).transform(Number),
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

module.exports = { PAGE_SIZES, listQuerySchema, exampleFormSchema, idParamSchema, toFieldErrors };
