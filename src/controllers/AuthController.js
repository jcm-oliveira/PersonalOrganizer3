const UserModel = require("../model/UserModel");
const AccessProfileModel = require("../model/AccessProfileModel");
const { hashPassword, verifyPassword, dummyHash } = require("../security/password");
const { startSession } = require("../security/session");
const {
    PASSWORD_MIN,
    loginSchema,
    safeNextPath,
    setupSchema,
    changePasswordSchema,
    toFieldErrors,
} = require("../validation/userSchemas");

const INVALID_LOGIN = "E-mail ou senha inválidos.";

function renderLogin(res, { status = 200, email = "", next = "/", error = null, message = null }) {
    return res.status(status).render("auth/login", {
        title: "Entrar",
        hideNav: true,
        email,
        next,
        error,
        message,
    });
}

module.exports = {
    //------------------------------------------------
    //                    LOGIN
    //------------------------------------------------

    async loadLoginPage(req, res) {
        if (req.user) return res.redirect(303, "/");
        if ((await UserModel.countUsers()) === 0) return res.redirect(303, "/setup");
        const message =
            req.query.msg === "logout"
                ? "Você saiu do sistema."
                : req.query.msg === "expired"
                  ? "Sua sessão expirou. Entre novamente."
                  : null;
        return renderLogin(res, { next: safeNextPath.parse(req.query.next ?? "/"), message });
    },

    async login(req, res) {
        const next = safeNextPath.parse(req.body?.next ?? "/");
        const parsed = loginSchema.safeParse(req.body ?? {});
        const email = typeof req.body?.email === "string" ? req.body.email.trim() : "";
        if (!parsed.success) {
            return renderLogin(res, { status: 422, email, next, error: INVALID_LOGIN });
        }

        const user = await UserModel.findForLogin(parsed.data.email);
        // Mesmo custo de verificação quando o e-mail não existe (não revela cadastro)
        const passwordOk = await verifyPassword(
            parsed.data.password,
            user ? user.password_hash : await dummyHash(),
        );
        if (!user || !passwordOk || user.status !== 1) {
            return renderLogin(res, { status: 401, email, next, error: INVALID_LOGIN });
        }

        await startSession(req, user);
        await UserModel.updateLastLogin(user.id);
        return res.redirect(303, next);
    },

    async logout(req, res) {
        await new Promise((resolve) => req.session.destroy(() => resolve()));
        res.clearCookie("po.sid");
        return res.redirect(303, "/login?msg=logout");
    },

    //------------------------------------------------
    //   PRIMEIRO ACESSO (sem nenhum usuário cadastrado)
    //------------------------------------------------

    async loadSetupPage(req, res) {
        if ((await UserModel.countUsers()) > 0) return res.redirect(303, "/login");
        return res.render("auth/setup", {
            title: "Primeiro acesso",
            hideNav: true,
            values: {},
            errors: {},
            passwordMin: PASSWORD_MIN,
        });
    },

    async setup(req, res) {
        if ((await UserModel.countUsers()) > 0) return res.redirect(303, "/login");
        const parsed = setupSchema.safeParse(req.body ?? {});
        if (!parsed.success) {
            return res.status(422).render("auth/setup", {
                title: "Primeiro acesso",
                hideNav: true,
                values: { name: req.body?.name, email: req.body?.email },
                errors: toFieldErrors(parsed.error),
                passwordMin: PASSWORD_MIN,
            });
        }

        const adminProfileId = await AccessProfileModel.findSystemProfileId();
        const id = await UserModel.insert(
            {
                name: parsed.data.name,
                email: parsed.data.email,
                phone: null,
                description: "Administrador criado no primeiro acesso.",
                password_hash: await hashPassword(parsed.data.password),
                status: 1,
            },
            adminProfileId ? [adminProfileId] : [],
        );
        await startSession(req, { id, session_version: 0 });
        await UserModel.updateLastLogin(id);
        return res.redirect(303, "/");
    },

    //------------------------------------------------
    //             TROCA DA PRÓPRIA SENHA
    //------------------------------------------------

    loadChangePasswordPage(req, res) {
        return res.render("auth/change-password", {
            title: "Alterar minha senha",
            errors: {},
            passwordMin: PASSWORD_MIN,
            message:
                req.query.msg === "changed"
                    ? { alertType: "alert-success", text: "Senha alterada com sucesso." }
                    : null,
        });
    },

    async changePassword(req, res) {
        const parsed = changePasswordSchema.safeParse(req.body ?? {});
        const render = (errors) =>
            res.status(422).render("auth/change-password", {
                title: "Alterar minha senha",
                errors,
                passwordMin: PASSWORD_MIN,
                message: null,
            });
        if (!parsed.success) return render(toFieldErrors(parsed.error));

        const user = await UserModel.findForLogin(req.user.email);
        if (!user || !(await verifyPassword(parsed.data.current_password, user.password_hash))) {
            return render({ current_password: "Senha atual incorreta." });
        }

        await UserModel.updatePassword(user.id, await hashPassword(parsed.data.new_password));
        // Mantém esta sessão; as demais sessões do usuário são encerradas
        await startSession(req, { id: user.id, session_version: user.session_version + 1 });
        return res.redirect(303, "/minha-conta/senha?msg=changed");
    },
};
