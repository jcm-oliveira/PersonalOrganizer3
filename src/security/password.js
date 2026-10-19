// Hash de senha com scrypt (nativo do Node, sem dependência externa).
// Formato gravado: scrypt$<N>$<r>$<p>$<salt base64url>$<hash base64url>
// Os parâmetros ficam no próprio hash, então podem ser aumentados no futuro sem
// invalidar as senhas já gravadas.
const crypto = require("node:crypto");
const { promisify } = require("node:util");

const scrypt = promisify(crypto.scrypt);

const PARAMS = { N: 2 ** 15, r: 8, p: 1 }; // ~32 MB de memória por hash
const KEY_LENGTH = 64;
const SALT_LENGTH = 16;
const MAX_MEMORY = 64 * 1024 * 1024;

async function hashPassword(password) {
    const salt = crypto.randomBytes(SALT_LENGTH);
    const key = await scrypt(String(password), salt, KEY_LENGTH, {
        ...PARAMS,
        maxmem: MAX_MEMORY,
    });
    return [
        "scrypt",
        PARAMS.N,
        PARAMS.r,
        PARAMS.p,
        salt.toString("base64url"),
        key.toString("base64url"),
    ].join("$");
}

async function verifyPassword(password, stored) {
    const parts = String(stored || "").split("$");
    if (parts.length !== 6 || parts[0] !== "scrypt") return false;
    const [, N, r, p, saltB64, keyB64] = parts;
    const expected = Buffer.from(keyB64, "base64url");
    try {
        const key = await scrypt(
            String(password),
            Buffer.from(saltB64, "base64url"),
            expected.length,
            {
                N: Number(N),
                r: Number(r),
                p: Number(p),
                maxmem: MAX_MEMORY,
            },
        );
        return crypto.timingSafeEqual(key, expected);
    } catch {
        return false;
    }
}

// Hash fixo usado quando o e-mail não existe, para o tempo de resposta do login
// não revelar se o e-mail está cadastrado.
let dummyHashPromise;
function dummyHash() {
    dummyHashPromise ??= hashPassword(crypto.randomBytes(16).toString("hex"));
    return dummyHashPromise;
}

module.exports = { hashPassword, verifyPassword, dummyHash };
