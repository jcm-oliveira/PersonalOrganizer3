const path = require("node:path");
const dotenv = require("dotenv");
const { z } = require("zod");

dotenv.config({ path: path.join(__dirname, "..", "..", ".env"), quiet: true });

function isValidTimeZone(timeZone) {
    try {
        new Intl.DateTimeFormat("pt-BR", { timeZone });
        return true;
    } catch {
        return false;
    }
}

const envSchema = z
    .object({
        NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
        PORT: z.coerce.number().int().positive().default(3000),
        DATABASE_URL: z.string().startsWith("mysql://"),
        // Assina o cookie de sessão do login. Valor aleatório e longo; nunca versionar.
        SESSION_SECRET: z.string().min(32).optional(),
        // Fuso horário de "hoje" e "agora" (farol, atrasos, calendário, avisos). Independe
        // do fuso do servidor (em produção, nos EUA). Padrão: horário de Brasília.
        APP_TIMEZONE: z
            .string()
            .default("America/Sao_Paulo")
            .refine(isValidTimeZone, {
                message: "Fuso horário inválido (ex.: America/Sao_Paulo).",
            }),
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

// Todas as datas do Node (new Date(), getHours(), getDate()...) passam a usar o fuso da
// aplicação. Este módulo é carregado antes de qualquer cálculo de data.
process.env.TZ = parsed.data.APP_TIMEZONE;

module.exports = Object.freeze(parsed.data);
