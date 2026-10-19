// Proteção CSRF (padrão "synchronizer token", com o token guardado na sessão).
// Formulários enviam o campo oculto "_csrf"; chamadas fetch enviam o cabeçalho
// "X-CSRF-Token". Formulários multipart (upload) são validados depois do multer,
// na própria rota (verifyCsrfAfterUpload).
const { csrfSync } = require("csrf-sync");

const { csrfSynchronisedProtection, generateToken, isRequestValid } = csrfSync({
    getTokenFromRequest: (req) => req.body?._csrf || req.headers["x-csrf-token"],
    errorConfig: {
        statusCode: 403,
        message: "Formulário expirado ou inválido. Recarregue a página e tente novamente.",
    },
});

function isMultipart(req) {
    return /^multipart\/form-data/i.test(req.headers["content-type"] || "");
}

/** Disponibiliza o token às views (res.locals.csrfToken). */
function exposeCsrfToken(req, res, next) {
    res.locals.csrfToken = generateToken(req);
    next();
}

/** Valida o token em POST/PUT/PATCH/DELETE (exceto multipart, validado após o upload). */
function csrfProtection(req, res, next) {
    if (isMultipart(req)) return next();
    return csrfSynchronisedProtection(req, res, next);
}

/** Para rotas multipart: valida depois que o multer leu os campos do formulário. */
function verifyCsrfAfterUpload(req, res, next) {
    // CSRF desligado no app (somente testes automatizados; ver createApp)
    if (req.app.locals.csrfEnabled === false) return next();
    if (isRequestValid(req)) return next();
    return csrfSynchronisedProtection(req, res, next); // gera o erro 403 padrão
}

module.exports = { exposeCsrfToken, csrfProtection, verifyCsrfAfterUpload };
