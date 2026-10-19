// Autenticação (sessão) e autorização (perfis de acesso).
const UserModel = require("../model/UserModel");
const { HttpError } = require("../errors/HttpError");
const { buildPermissionMap, can, LOOKUP_PREFIX_RESOURCE } = require("../security/permissions");

/** Monta o usuário da requisição a partir do registro do banco. */
function toCurrentUser(row) {
    return {
        id: row.id,
        name: row.name,
        email: row.email,
        photo_file: row.photo_file,
        sessionVersion: row.session_version,
        isAdmin: (row.profiles || []).some((p) => Number(p.is_system) === 1),
        profileNames: (row.profiles || []).map((p) => p.name),
        permissions: buildPermissionMap(row.permissionRows),
    };
}

/**
 * Carrega o usuário logado (req.user) e expõe helpers às views:
 * currentUser, can(tela, ação) e canLookup(prefixoDaRota, ação).
 * resolveUser: apenas para testes automatizados (ver createApp).
 */
function loadCurrentUser({ resolveUser } = {}) {
    return async function loadCurrentUserMiddleware(req, res, next) {
        req.user = null;
        if (resolveUser) {
            req.user = (await resolveUser(req)) || null;
        } else if (req.session?.userId) {
            const row = await UserModel.findSessionUser(req.session.userId);
            // Usuário inativado/excluído ou senha trocada em outro lugar: sessão encerrada
            if (row && row.session_version === req.session.sessionVersion) {
                req.user = toCurrentUser(row);
            } else {
                delete req.session.userId;
                delete req.session.sessionVersion;
            }
        }

        res.locals.currentUser = req.user;
        res.locals.can = (resource, action) => can(req.user, resource, action);
        res.locals.canLookup = (prefix, action) =>
            can(req.user, LOOKUP_PREFIX_RESOURCE[prefix], action);
        return next();
    };
}

function wantsJson(req) {
    return req.accepts(["html", "json"]) === "json";
}

/** Exige login. Páginas vão para o login (voltando depois para onde estavam). */
function requireAuth(req, res, next) {
    if (req.user) return next();
    if (wantsJson(req) || req.method !== "GET") {
        return next(new HttpError(401, "Sua sessão expirou. Entre novamente."));
    }
    const params = new URLSearchParams({ next: req.originalUrl });
    return res.redirect(303, `/login?${params}`);
}

/** Exige login e a permissão da ação na tela. */
function requirePermission(resource, action) {
    return function requirePermissionMiddleware(req, res, next) {
        if (!req.user) return requireAuth(req, res, next);
        if (can(req.user, resource, action)) return next();
        return next(new HttpError(403, "Você não tem permissão para acessar esta funcionalidade."));
    };
}

/** Exige login e ao menos uma das permissões: [[tela, ação], ...]. */
function requireAnyPermission(pairs) {
    return function requireAnyPermissionMiddleware(req, res, next) {
        if (!req.user) return requireAuth(req, res, next);
        if (pairs.some(([resource, action]) => can(req.user, resource, action))) return next();
        return next(new HttpError(403, "Você não tem permissão para acessar esta funcionalidade."));
    };
}

module.exports = {
    loadCurrentUser,
    requireAuth,
    requirePermission,
    requireAnyPermission,
    toCurrentUser,
};
