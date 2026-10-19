const express = require("express");
const { rateLimit } = require("express-rate-limit");
const AuthController = require("../controllers/AuthController");
const { requireAuth } = require("../middlewares/auth");

/**
 * Rotas públicas (sem login): entrar, sair e primeiro acesso.
 * Criadas por instância do app, cada uma com seu limitador de tentativas.
 */
function createPublicRoutes() {
    const routes = express.Router();

    // Limite de tentativas FALHAS de login por IP (logins corretos não contam)
    const loginLimiter = rateLimit({
        windowMs: 15 * 60 * 1000,
        limit: 10,
        skipSuccessfulRequests: true,
        standardHeaders: "draft-8",
        legacyHeaders: false,
        handler: (req, res) =>
            res.status(429).render("auth/login", {
                title: "Entrar",
                hideNav: true,
                email: typeof req.body?.email === "string" ? req.body.email.trim() : "",
                next: "/",
                error: "Muitas tentativas de login. Aguarde 15 minutos e tente novamente.",
                message: null,
            }),
    });

    routes.get("/login", AuthController.loadLoginPage);
    routes.post("/login", loginLimiter, AuthController.login);
    routes.post("/logout", AuthController.logout);
    routes.get("/setup", AuthController.loadSetupPage);
    routes.post("/setup", loginLimiter, AuthController.setup);
    return routes;
}

// Conta do próprio usuário (exige login)
const accountRoutes = express.Router();
accountRoutes.get("/minha-conta/senha", requireAuth, AuthController.loadChangePasswordPage);
accountRoutes.post("/minha-conta/senha", requireAuth, AuthController.changePassword);

module.exports = { createPublicRoutes, accountRoutes };
