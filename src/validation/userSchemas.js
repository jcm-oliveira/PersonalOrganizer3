const { z } = require("zod");

const PAGE_SIZES = [10, 25, 50, 100];

const optionalText = (max, message) =>
    z
        .string()
        .trim()
        .max(max, message)
        .optional()
        .or(z.literal(""))
        .transform((val) => (val && val.trim() !== "" ? val.trim() : null));

const emailField = z
    .string({ error: "Informe o e-mail." })
    .trim()
    .toLowerCase()
    .min(1, "Informe o e-mail.")
    .max(190, "O e-mail deve ter no máximo 190 caracteres.")
    .pipe(z.email("Informe um e-mail válido."));

const PASSWORD_MIN = 8;
const passwordField = z
    .string({ error: "Informe a senha." })
    .min(PASSWORD_MIN, `A senha deve ter no mínimo ${PASSWORD_MIN} caracteres.`)
    .max(128, "A senha deve ter no máximo 128 caracteres.");

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

//------------------------------------------------
//                     LOGIN
//------------------------------------------------

const loginSchema = z.object({
    email: emailField,
    password: z.string({ error: "Informe a senha." }).min(1, "Informe a senha.").max(200),
});

// Destino após o login: só caminhos internos ("/..."), nunca outro site
const safeNextPath = z
    .string()
    .trim()
    .regex(/^\/(?!\/)[^\s\\]*$/)
    .catch("/");

function passwordsMatch(fieldNew, fieldConfirm) {
    return (val, ctx) => {
        if (val[fieldNew] && val[fieldNew] !== val[fieldConfirm]) {
            ctx.addIssue({
                code: "custom",
                path: [fieldConfirm],
                message: "A confirmação não confere com a senha.",
            });
        }
    };
}

// Primeiro acesso: cria o administrador
const setupSchema = z
    .object({
        name: z
            .string({ error: "Informe o nome." })
            .trim()
            .min(2, "Informe o nome.")
            .max(150, "O nome deve ter no máximo 150 caracteres."),
        email: emailField,
        password: passwordField,
        password_confirm: z.string().optional().default(""),
    })
    .superRefine(passwordsMatch("password", "password_confirm"));

// Troca da própria senha
const changePasswordSchema = z
    .object({
        current_password: z
            .string({ error: "Informe a senha atual." })
            .min(1, "Informe a senha atual."),
        new_password: passwordField,
        password_confirm: z.string().optional().default(""),
    })
    .superRefine(passwordsMatch("new_password", "password_confirm"));

//------------------------------------------------
//                   USUÁRIOS
//------------------------------------------------

const listQuerySchema = z.object({
    status: z.enum(["1", "0", "all"]).catch("1"),
    search: z.string().trim().max(150).catch(""),
    profileId: z.coerce.number().int().positive().optional().catch(undefined),
    page: z.coerce.number().int().min(1).catch(1),
    perPage: z.coerce
        .number()
        .refine((val) => PAGE_SIZES.includes(val))
        .catch(PAGE_SIZES[0]),
});

/** isCreate: na inserção a senha é obrigatória; na edição é opcional (troca). */
function userFormSchema({ isCreate }) {
    return z
        .object({
            name: z
                .string({ error: "Informe o nome." })
                .trim()
                .min(2, "Informe o nome.")
                .max(150, "O nome deve ter no máximo 150 caracteres."),
            email: emailField,
            phone: optionalText(30, "O telefone deve ter no máximo 30 caracteres.").refine(
                (val) => val === null || /^[0-9()+\-.\s]{8,30}$/.test(val),
                "Telefone inválido. Use apenas números, espaços, parênteses, + e -.",
            ),
            description: optionalText(2000, "A descrição deve ter no máximo 2000 caracteres."),
            status: z.enum(["0", "1"]).catch("1").transform(Number),
            profile_ids: idList,
            password: isCreate
                ? passwordField
                : z
                      .string()
                      .optional()
                      .transform((val) => (val ? val : undefined))
                      .pipe(passwordField.optional()),
            password_confirm: z.string().optional().default(""),
            remove_photo: z
                .string()
                .optional()
                .transform((val) => val === "1"),
        })
        .superRefine(passwordsMatch("password", "password_confirm"));
}

//------------------------------------------------
//               PERFIS DE ACESSO
//------------------------------------------------

const profileFormSchema = z.object({
    name: z
        .string({ error: "Informe o nome do perfil." })
        .trim()
        .min(2, "Informe o nome do perfil.")
        .max(100, "O nome deve ter no máximo 100 caracteres."),
    description: optionalText(2000, "A descrição deve ter no máximo 2000 caracteres."),
    status: z.enum(["0", "1"]).catch("1").transform(Number),
    perm: z.union([z.string(), z.array(z.string())]).optional(),
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
    PASSWORD_MIN,
    loginSchema,
    safeNextPath,
    setupSchema,
    changePasswordSchema,
    listQuerySchema,
    userFormSchema,
    profileFormSchema,
    idParamSchema,
    toFieldErrors,
};
