const { HttpError } = require("../errors/HttpError");

const GENERIC_MESSAGE = "Ocorreu um erro inesperado. Tente novamente mais tarde.";

function notFound(req, res, next) {
    next(new HttpError(404, "Página não encontrada."));
}

function errorHandler(err, req, res, next) {
    if (res.headersSent) {
        return next(err);
    }

    // HttpError da aplicação, ou erros "expostos" do Express (ex.: JSON malformado = 400).
    const status = err instanceof HttpError ? err.status : (err.expose && err.status) || 500;
    const message = status >= 500 ? GENERIC_MESSAGE : err.message;

    if (status >= 500) {
        console.error(err);
    }

    res.status(status);
    if (req.accepts(["html", "json"]) === "json") {
        return res.json({ message });
    }
    return res.render("errors/error", { title: `Erro ${status}`, status, message });
}

module.exports = { notFound, errorHandler };
