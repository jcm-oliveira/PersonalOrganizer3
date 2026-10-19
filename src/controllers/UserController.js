const path = require("node:path");
const UserModel = require("../model/UserModel");
const AccessProfileModel = require("../model/AccessProfileModel");
const { HttpError } = require("../errors/HttpError");
const { hashPassword } = require("../security/password");
const { startSession } = require("../security/session");
const { can } = require("../security/permissions");
const { USER_PHOTO_DIR, PHOTO_FILE_PATTERN, removePhotoFile } = require("../middlewares/upload");
const {
    PAGE_SIZES,
    PASSWORD_MIN,
    listQuerySchema,
    userFormSchema,
    idParamSchema,
    toFieldErrors,
} = require("../validation/userSchemas");
const { buildPagination, messageFrom } = require("./listHelpers");

const LIST_URL = "/cms-User-Q";

const MESSAGES = {
    created: { alertType: "alert-success", text: "Usuário inserido com sucesso." },
    updated: { alertType: "alert-success", text: "Usuário alterado com sucesso." },
    deleted: { alertType: "alert-warning", text: "Usuário excluído com sucesso." },
    selfDelete: { alertType: "alert-danger", text: "Você não pode excluir o seu próprio usuário." },
    lastAdmin: {
        alertType: "alert-danger",
        text: "Não é possível excluir o último administrador ativo do sistema.",
    },
};

function parseId(rawId) {
    const parsed = idParamSchema.safeParse(rawId);
    if (!parsed.success) throw new HttpError(404, "Usuário não encontrado.");
    return parsed.data;
}

function photoUrl(user) {
    return user?.photo_file ? `/cms-User/${user.id}/foto?v=${user.photo_file.slice(0, 8)}` : null;
}

async function renderForm(res, { status = 200, isCreate, values, errors, user = null }) {
    const profiles = await AccessProfileModel.selectActiveOptions();
    return res.status(status).render(isCreate ? "cms/cms-User-C" : "cms/cms-User-U", {
        title: isCreate ? "Novo Usuário" : `Editar Usuário nº ${user.id}`,
        isCreate,
        values,
        errors,
        user,
        photoUrl: photoUrl(user),
        profiles,
        passwordMin: PASSWORD_MIN,
    });
}

// Valores do formulário a partir do corpo enviado (para exibir de novo após erro)
function valuesFromBody(body) {
    return {
        name: body.name ?? "",
        email: body.email ?? "",
        phone: body.phone ?? "",
        description: body.description ?? "",
        status: body.status ?? "1",
        profile_ids: [].concat(body.profile_ids ?? []).map(String),
    };
}

/**
 * Valida o formulário (campos, e-mail único, perfis existentes e foto).
 * Retorna { data, profileIds } ou { errors }.
 */
async function validateForm(req, { isCreate, userId = null }) {
    const parsed = userFormSchema({ isCreate }).safeParse(req.body ?? {});
    const errors = parsed.success ? {} : toFieldErrors(parsed.error);
    if (req.uploadError) errors.photo = req.uploadError;

    if (parsed.success && (await UserModel.emailInUse(parsed.data.email, userId))) {
        errors.email = "Já existe um usuário com este e-mail.";
    }
    if (Object.keys(errors).length > 0) return { errors };

    // Só perfis ativos existentes
    const activeProfiles = await AccessProfileModel.selectActiveOptions();
    const activeIds = new Set(activeProfiles.map((p) => p.id));
    const profileIds = parsed.data.profile_ids.filter((id) => activeIds.has(id));
    const systemId = activeProfiles.find((p) => Number(p.is_system) === 1)?.id ?? null;
    return { data: parsed.data, profileIds, systemId };
}

module.exports = {
    //------------------------------------------------
    //                  CONSULTA (Q)
    //------------------------------------------------

    async loadShowPage(req, res) {
        const query = listQuerySchema.parse(req.query ?? {});
        const filter = {
            status: query.status === "all" ? null : Number(query.status),
            search: query.search,
            profileId: query.profileId,
        };
        const total = await UserModel.count(filter);
        const pagination = buildPagination({
            page: query.page,
            perPage: query.perPage,
            total,
            baseUrl: LIST_URL,
            queryParams: {
                status: query.status,
                search: query.search,
                profileId: query.profileId,
                perPage: query.perPage,
            },
        });
        const [items, profiles] = await Promise.all([
            UserModel.selectList({ ...filter, limit: query.perPage, offset: pagination.offset }),
            AccessProfileModel.selectActiveOptions(),
        ]);

        return res.render("cms/cms-User-Q", {
            title: "Usuários",
            items: items.map((u) => ({ ...u, photoUrl: photoUrl(u) })),
            filter: query,
            profiles,
            pageSizes: PAGE_SIZES,
            pagination: { ...pagination, lastItem: pagination.offset + items.length },
            message: messageFrom(MESSAGES, req.query.msg),
        });
    },

    //------------------------------------------------
    //                  INSERÇÃO (C)
    //------------------------------------------------

    async loadInsertPage(req, res) {
        return renderForm(res, {
            isCreate: true,
            values: { status: "1", profile_ids: [] },
            errors: {},
        });
    },

    async insertPage(req, res) {
        const result = await validateForm(req, { isCreate: true });
        if (result.errors) {
            if (req.file) removePhotoFile(req.file.filename);
            return renderForm(res, {
                status: 422,
                isCreate: true,
                values: valuesFromBody(req.body ?? {}),
                errors: result.errors,
            });
        }

        const { data, profileIds } = result;
        await UserModel.insert(
            {
                name: data.name,
                email: data.email,
                phone: data.phone,
                description: data.description,
                photo_file: req.file ? req.file.filename : null,
                password_hash: await hashPassword(data.password),
                status: data.status,
            },
            profileIds,
        );
        return res.redirect(303, `${LIST_URL}?msg=created`);
    },

    //------------------------------------------------
    //                  ALTERAÇÃO (U)
    //------------------------------------------------

    async loadUpdatePage(req, res) {
        const id = parseId(req.params.id);
        const user = await UserModel.selectById(id);
        if (!user) throw new HttpError(404, "Usuário não encontrado.");
        return renderForm(res, {
            isCreate: false,
            user,
            values: {
                name: user.name,
                email: user.email,
                phone: user.phone || "",
                description: user.description || "",
                status: String(user.status),
                profile_ids: user.profiles.map((p) => String(p.id)),
            },
            errors: {},
        });
    },

    async updatePage(req, res) {
        const id = parseId(req.params.id);
        const user = await UserModel.selectById(id);
        if (!user) {
            if (req.file) removePhotoFile(req.file.filename);
            throw new HttpError(404, "Usuário não encontrado.");
        }

        const result = await validateForm(req, { isCreate: false, userId: id });
        const errors = result.errors || {};
        if (!result.errors) {
            const { data, profileIds, systemId } = result;
            const isSelf = req.user && req.user.id === id;
            const wasAdmin =
                user.status === 1 && user.profiles.some((p) => Number(p.is_system) === 1);
            const willBeAdmin =
                data.status === 1 && systemId !== null && profileIds.includes(systemId);

            if (isSelf && data.status === 0) {
                errors.status = "Você não pode inativar o seu próprio usuário.";
            }
            if (wasAdmin && !willBeAdmin && (await UserModel.countActiveAdmins(id)) === 0) {
                errors.profile_ids =
                    "Este é o último administrador ativo: mantenha o perfil Administrador e o status Ativo.";
            }
        }
        if (Object.keys(errors).length > 0) {
            if (req.file) removePhotoFile(req.file.filename);
            return renderForm(res, {
                status: 422,
                isCreate: false,
                user,
                values: valuesFromBody(req.body ?? {}),
                errors,
            });
        }

        const { data, profileIds } = result;
        let photoFile; // undefined = mantém a foto atual
        if (req.file) photoFile = req.file.filename;
        else if (data.remove_photo) photoFile = null;

        await UserModel.update(
            id,
            {
                name: data.name,
                email: data.email,
                phone: data.phone,
                description: data.description,
                status: data.status,
                photo_file: photoFile,
                password_hash: data.password ? await hashPassword(data.password) : undefined,
            },
            profileIds,
        );
        if (photoFile !== undefined && user.photo_file) removePhotoFile(user.photo_file);

        // Trocou a própria senha: mantém esta sessão (as demais são encerradas)
        if (req.user && req.user.id === id && data.password && req.session) {
            await startSession(req, { id, session_version: req.user.sessionVersion + 1 });
        }

        return res.redirect(303, `${LIST_URL}?msg=updated`);
    },

    //------------------------------------------------
    //                  EXCLUSÃO (D)
    //------------------------------------------------

    async deletePage(req, res) {
        const id = parseId(req.params.id);
        if (req.user && req.user.id === id) {
            return res.redirect(303, `${LIST_URL}?msg=selfDelete`);
        }
        const user = await UserModel.selectById(id);
        if (!user) throw new HttpError(404, "Usuário não encontrado.");
        const isAdmin = user.status === 1 && user.profiles.some((p) => Number(p.is_system) === 1);
        if (isAdmin && (await UserModel.countActiveAdmins(id)) === 0) {
            return res.redirect(303, `${LIST_URL}?msg=lastAdmin`);
        }

        await UserModel.softDelete(id);
        return res.redirect(303, `${LIST_URL}?msg=deleted`);
    },

    //------------------------------------------------
    //    FOTO (só para usuários logados; fora de public/)
    //------------------------------------------------

    async photo(req, res) {
        const id = parseId(req.params.id);
        if (req.user.id !== id && !can(req.user, "users", "view")) {
            throw new HttpError(403, "Você não tem permissão para acessar esta funcionalidade.");
        }
        const file = await UserModel.selectPhotoFile(id);
        if (!file || !PHOTO_FILE_PATTERN.test(file)) {
            throw new HttpError(404, "Foto não encontrada.");
        }
        res.set("Cache-Control", "private, max-age=86400");
        res.set("X-Content-Type-Options", "nosniff");
        return res.sendFile(path.join(USER_PHOTO_DIR, file), (err) => {
            if (err && !res.headersSent) res.status(404).end();
        });
    },
};
