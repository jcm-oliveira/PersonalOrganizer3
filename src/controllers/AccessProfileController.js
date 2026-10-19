const AccessProfileModel = require("../model/AccessProfileModel");
const { HttpError } = require("../errors/HttpError");
const { ACTIONS, RESOURCES, permissionsFromForm } = require("../security/permissions");
const {
    PAGE_SIZES,
    listQuerySchema,
    profileFormSchema,
    idParamSchema,
    toFieldErrors,
} = require("../validation/userSchemas");
const { buildPagination, messageFrom } = require("./listHelpers");

const LIST_URL = "/cms-AccessProfile-Q";

const MESSAGES = {
    created: { alertType: "alert-success", text: "Perfil de acesso inserido com sucesso." },
    updated: { alertType: "alert-success", text: "Perfil de acesso alterado com sucesso." },
    deleted: { alertType: "alert-warning", text: "Perfil de acesso excluído com sucesso." },
    systemProfile: {
        alertType: "alert-danger",
        text: "O perfil Administrador é do sistema e não pode ser alterado nem excluído.",
    },
};

function parseId(rawId) {
    const parsed = idParamSchema.safeParse(rawId);
    if (!parsed.success) throw new HttpError(404, "Perfil de acesso não encontrado.");
    return parsed.data;
}

// "tela:ação" marcados, a partir das linhas gravadas no banco
function checkedFromRows(rows) {
    const checked = [];
    for (const row of rows || []) {
        for (const action of ACTIONS) {
            if (Number(row[action.column]) === 1) checked.push(`${row.resource}:${action.key}`);
        }
    }
    return checked;
}

function renderForm(res, { status = 200, isCreate, values, errors, profile = null }) {
    return res
        .status(status)
        .render(isCreate ? "cms/cms-AccessProfile-C" : "cms/cms-AccessProfile-U", {
            title: isCreate ? "Novo Perfil de Acesso" : `Editar Perfil de Acesso nº ${profile.id}`,
            isCreate,
            values,
            errors,
            profile,
            resources: RESOURCES,
            actions: ACTIONS,
        });
}

function valuesFromBody(body) {
    return {
        name: body.name ?? "",
        description: body.description ?? "",
        status: body.status ?? "1",
        checked: [].concat(body.perm ?? []).map(String),
    };
}

async function validateForm(body, exceptId = null) {
    const parsed = profileFormSchema.safeParse(body ?? {});
    const errors = parsed.success ? {} : toFieldErrors(parsed.error);
    if (parsed.success && (await AccessProfileModel.nameInUse(parsed.data.name, exceptId))) {
        errors.name = "Já existe um perfil com este nome.";
    }
    if (Object.keys(errors).length > 0) return { errors };
    return { data: parsed.data, permissions: permissionsFromForm(parsed.data.perm) };
}

module.exports = {
    async loadShowPage(req, res) {
        const query = listQuerySchema.parse(req.query ?? {});
        const filter = {
            status: query.status === "all" ? null : Number(query.status),
            search: query.search,
        };
        const total = await AccessProfileModel.count(filter);
        const pagination = buildPagination({
            page: query.page,
            perPage: query.perPage,
            total,
            baseUrl: LIST_URL,
            queryParams: { status: query.status, search: query.search, perPage: query.perPage },
        });
        const items = await AccessProfileModel.selectList({
            ...filter,
            limit: query.perPage,
            offset: pagination.offset,
        });

        return res.render("cms/cms-AccessProfile-Q", {
            title: "Perfis de Acesso",
            items,
            filter: query,
            pageSizes: PAGE_SIZES,
            pagination: { ...pagination, lastItem: pagination.offset + items.length },
            message: messageFrom(MESSAGES, req.query.msg),
        });
    },

    loadInsertPage(req, res) {
        return renderForm(res, {
            isCreate: true,
            values: { status: "1", checked: [] },
            errors: {},
        });
    },

    async insertPage(req, res) {
        const result = await validateForm(req.body);
        if (result.errors) {
            return renderForm(res, {
                status: 422,
                isCreate: true,
                values: valuesFromBody(req.body ?? {}),
                errors: result.errors,
            });
        }
        await AccessProfileModel.insert(result.data, result.permissions);
        return res.redirect(303, `${LIST_URL}?msg=created`);
    },

    // Também exibe o perfil de sistema (somente leitura)
    async loadUpdatePage(req, res) {
        const id = parseId(req.params.id);
        const profile = await AccessProfileModel.selectById(id);
        if (!profile) throw new HttpError(404, "Perfil de acesso não encontrado.");
        return renderForm(res, {
            isCreate: false,
            profile,
            values: {
                name: profile.name,
                description: profile.description || "",
                status: String(profile.status),
                checked: checkedFromRows(profile.permissions),
            },
            errors: {},
        });
    },

    async updatePage(req, res) {
        const id = parseId(req.params.id);
        const profile = await AccessProfileModel.selectById(id);
        if (!profile) throw new HttpError(404, "Perfil de acesso não encontrado.");
        if (Number(profile.is_system) === 1) {
            return res.redirect(303, `${LIST_URL}?msg=systemProfile`);
        }

        const result = await validateForm(req.body, id);
        if (result.errors) {
            return renderForm(res, {
                status: 422,
                isCreate: false,
                profile,
                values: valuesFromBody(req.body ?? {}),
                errors: result.errors,
            });
        }
        await AccessProfileModel.update(id, result.data, result.permissions);
        return res.redirect(303, `${LIST_URL}?msg=updated`);
    },

    async deletePage(req, res) {
        const id = parseId(req.params.id);
        const profile = await AccessProfileModel.selectById(id);
        if (!profile) throw new HttpError(404, "Perfil de acesso não encontrado.");
        if (Number(profile.is_system) === 1) {
            return res.redirect(303, `${LIST_URL}?msg=systemProfile`);
        }
        await AccessProfileModel.softDelete(id);
        return res.redirect(303, `${LIST_URL}?msg=deleted`);
    },
};
