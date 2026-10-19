const path = require("node:path");
const dotenv = require("dotenv");
const { z } = require("zod");

dotenv.config({ path: path.join(__dirname, "..", "..", ".env"), quiet: true });

const envSchema = z
    .object({
        NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
        PORT: z.coerce.number().int().positive().default(3000),
        DATABASE_URL: z.string().startsWith("mysql://"),
        // Assina o cookie de sessão do login. Valor aleatório e longo; nunca versionar.
        SESSION_SECRET: z.string().min(32).optional(),
    })
    .transform((env) => ({
        ...env,
        // Nos testes automatizados não é preciso configurar um segredo
        SESSION_SECRET:
            env.SESSION_SECRET ??
            (env.NODE_ENV === "test" ? "segredo-apenas-para-testes-automatizados-000" : undefined),
    }))
    .refine((env) => Boolean(env.SESSION_SECRET), {
        path: ["SESSION_SECRET"],
        message: "Obrigatório (mínimo de 32 caracteres).",
    });

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
    const fields = parsed.error.issues.map((issue) => issue.path.join(".")).join(", ");
    throw new Error(`Variáveis de ambiente inválidas ou ausentes: ${fields}. Veja o .env.example.`);
}

module.exports = Object.freeze(parsed.data);
