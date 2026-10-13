const HttpError = require("../errors/HttpError");
const {
    lookupListQuerySchema,
    themeOrgListQuerySchema,
    lifeSphereFormSchema,
    activityStatusFormSchema,
    simpleLookupFormSchema,
    themeOrganizationFormSchema,
    toFieldErrors,
    PAGE_SIZES,
} = require("../validation/lookupSchemas");
const {
    LifeSphereModel,
    RelevanceModel,
    DayPeriodModel,
    PeriodicityModel,
    ActionTypeModel,
    ThemeOrganizationModel,
    ActivityStatusModel,
} = require("../model/LookupModels");

function parseId(param) {
    const id = Number(param);
    if (!Number.isInteger(id) || id <= 0) {
        throw new HttpError(400, "Identificador inválido.");
    }
    return id;
}

function buildPagination({ page, perPage, total, baseUrl, queryParams = {} }) {
    const totalPages = Math.max(1, Math.ceil(total / perPage));
    const firstItem = total === 0 ? 0 : (page - 1) * perPage + 1;
    const lastItem = Math.min(total, page * perPage);

    const makeUrl = (targetPage) => {
        const params = new URLSearchParams();
        Object.entries(queryParams).forEach(([key, val]) => {
            if (val !== undefined && val !== null && val !== "" && key !== "page") {
                params.set(key, String(val));
            }
        });
        params.set("page", String(targetPage));
        return `${baseUrl}?${params.toString()}`;
    };

    return {
        page,
        perPage,
        total,
        totalPages,
        firstItem,
        lastItem,
        previousUrl: page > 1 ? makeUrl(page - 1) : null,
        nextUrl: page < totalPages ? makeUrl(page + 1) : null,
    };
}

// Handler genérico para cadastros simples
function createSimpleLookupController({
    model,
    entityName,
    entityTitle,
    routePrefix,
    formSchema,
    extraViewData = async () => ({}),
}) {
    return {
        async loadShowPage(req, res) {
            const query = lookupListQuerySchema.parse(req.query ?? {});
            const statusFilter = query.status === "all" ? null : Number(query.status);

            const [total, items, extraData] = await Promise.all([
                model.count({ status: statusFilter, search: query.search }),
                model.selectList({
                    status: statusFilter,
                    search: query.search,
                    page: query.page,
                    perPage: query.perPage,
                }),
                extraViewData(),
            ]);

            const pagination = buildPagination({
                page: query.page,
                perPage: query.perPage,
                total,
                baseUrl: `/${routePrefix}-Q`,
                queryParams: {
                    status: query.status,
                    search: query.search,
                    perPage: query.perPage,
                },
            });

            return res.render(`cms/${routePrefix}-Q`, {
                title: entityTitle,
                items,
                filter: query,
                pageSizes: PAGE_SIZES,
                pagination,
                routePrefix,
                entityName,
                entityTitle,
                ...extraData,
            });
        },

        async loadInsertPage(req, res) {
            const extraData = await extraViewData();
            return res.render(`cms/${routePrefix}-C`, {
                title: `Novo(a) ${entityName}`,
                values: { status: "1" },
                errors: {},
                routePrefix,
                entityName,
                entityTitle,
                ...extraData,
            });
        },

        async insertPage(req, res) {
            const parsed = formSchema.safeParse(req.body ?? {});
            if (!parsed.success) {
                const extraData = await extraViewData();
                return res.status(422).render(`cms/${routePrefix}-C`, {
                    title: `Novo(a) ${entityName}`,
                    values: req.body ?? {},
                    errors: toFieldErrors(parsed.error),
                    routePrefix,
                    entityName,
                    entityTitle,
                    ...extraData,
                });
            }

            await model.insert(parsed.data);
            return res.redirect(303, `/${routePrefix}-Q?msg=created`);
        },

        async loadUpdatePage(req, res) {
            const id = parseId(req.params.id);
            const [item, extraData] = await Promise.all([model.selectById(id), extraViewData()]);
            if (!item) {
                throw new HttpError(404, `${entityName} não encontrado(a).`);
            }

            return res.render(`cms/${routePrefix}-U`, {
                title: `Editar ${entityName} nº ${id}`,
                itemId: id,
                values: {
                    name: item.name,
                    description: item.description || "",
                    status: String(item.status),
                    ...(item.color_code ? { color_code: item.color_code } : {}),
                    ...(item.life_sphere_id ? { life_sphere_id: String(item.life_sphere_id) } : {}),
                },
                errors: {},
                routePrefix,
                entityName,
                entityTitle,
                ...extraData,
            });
        },

        async updatePage(req, res) {
            const id = parseId(req.params.id);
            const parsed = formSchema.safeParse(req.body ?? {});
            if (!parsed.success) {
                const extraData = await extraViewData();
                return res.status(422).render(`cms/${routePrefix}-U`, {
                    title: `Editar ${entityName} nº ${id}`,
                    itemId: id,
                    values: req.body ?? {},
                    errors: toFieldErrors(parsed.error),
                    routePrefix,
                    entityName,
                    entityTitle,
                    ...extraData,
                });
            }

            const affected = await model.update(id, parsed.data);
            if (affected === 0) {
                throw new HttpError(404, `${entityName} não encontrado(a).`);
            }
            return res.redirect(303, `/${routePrefix}-Q?msg=updated`);
        },

        async loadViewPage(req, res) {
            const id = parseId(req.params.id);
            const [item, extraData] = await Promise.all([model.selectById(id), extraViewData()]);
            if (!item) {
                throw new HttpError(404, `${entityName} não encontrado(a).`);
            }

            return res.render(`cms/${routePrefix}-V`, {
                title: `Visualizar ${entityName} nº ${id}`,
                item,
                routePrefix,
                entityName,
                entityTitle,
                ...extraData,
            });
        },

        async deletePage(req, res) {
            const id = parseId(req.params.id);
            const affected = await model.deleteLogical(id);
            if (affected === 0) {
                throw new HttpError(404, `${entityName} não encontrado(a).`);
            }
            return res.redirect(303, `/${routePrefix}-Q?msg=deleted`);
        },
    };
}

// 1. Esfera da Vida
const LifeSphereController = createSimpleLookupController({
    model: LifeSphereModel,
    entityName: "Esfera da Vida",
    entityTitle: "Esferas da Vida",
    routePrefix: "cms-LifeSphere",
    formSchema: lifeSphereFormSchema,
});

// 2. Relevância
const RelevanceController = createSimpleLookupController({
    model: RelevanceModel,
    entityName: "Relevância",
    entityTitle: "Relevâncias",
    routePrefix: "cms-Relevance",
    formSchema: simpleLookupFormSchema("Relevância", 50),
});

// 3. Período do Dia
const DayPeriodController = createSimpleLookupController({
    model: DayPeriodModel,
    entityName: "Período do Dia",
    entityTitle: "Períodos do Dia",
    routePrefix: "cms-DayPeriod",
    formSchema: simpleLookupFormSchema("Período do Dia", 50),
});

// 4. Periodicidade
const PeriodicityController = createSimpleLookupController({
    model: PeriodicityModel,
    entityName: "Periodicidade",
    entityTitle: "Periodicidades",
    routePrefix: "cms-Periodicity",
    formSchema: simpleLookupFormSchema("Periodicidade", 50),
});

// 5. Tipo de Ação
const ActionTypeController = createSimpleLookupController({
    model: ActionTypeModel,
    entityName: "Tipo de Ação",
    entityTitle: "Tipos de Ação",
    routePrefix: "cms-ActionType",
    formSchema: simpleLookupFormSchema("Tipo de Ação", 100),
});

// 6. Organização por Tema (com amarração com Esfera da Vida)
const ThemeOrganizationController = {
    async loadShowPage(req, res) {
        const query = themeOrgListQuerySchema.parse(req.query ?? {});
        const statusFilter = query.status === "all" ? null : Number(query.status);

        const [total, items, lifeSpheres] = await Promise.all([
            ThemeOrganizationModel.count({
                status: statusFilter,
                search: query.search,
                lifeSphereId: query.lifeSphereId,
            }),
            ThemeOrganizationModel.selectList({
                status: statusFilter,
                search: query.search,
                lifeSphereId: query.lifeSphereId,
                page: query.page,
                perPage: query.perPage,
            }),
            LifeSphereModel.selectActiveOptionsWithColor(),
        ]);

        const pagination = buildPagination({
            page: query.page,
            perPage: query.perPage,
            total,
            baseUrl: "/cms-ThemeOrganization-Q",
            queryParams: {
                status: query.status,
                search: query.search,
                lifeSphereId: query.lifeSphereId,
                perPage: query.perPage,
            },
        });

        return res.render("cms/cms-ThemeOrganization-Q", {
            title: "Organizações por Tema",
            items,
            lifeSpheres,
            filter: query,
            pageSizes: PAGE_SIZES,
            pagination,
            routePrefix: "cms-ThemeOrganization",
            entityName: "Organização por Tema",
            entityTitle: "Organizações por Tema",
        });
    },

    async loadInsertPage(req, res) {
        const lifeSpheres = await LifeSphereModel.selectActiveOptionsWithColor();
        return res.render("cms/cms-ThemeOrganization-C", {
            title: "Nova Organização por Tema",
            values: { status: "1" },
            lifeSpheres,
            errors: {},
            routePrefix: "cms-ThemeOrganization",
            entityName: "Organização por Tema",
            entityTitle: "Organizações por Tema",
        });
    },

    async insertPage(req, res) {
        const parsed = themeOrganizationFormSchema.safeParse(req.body ?? {});
        if (!parsed.success) {
            const lifeSpheres = await LifeSphereModel.selectActiveOptionsWithColor();
            return res.status(422).render("cms/cms-ThemeOrganization-C", {
                title: "Nova Organização por Tema",
                values: req.body ?? {},
                lifeSpheres,
                errors: toFieldErrors(parsed.error),
                routePrefix: "cms-ThemeOrganization",
                entityName: "Organização por Tema",
                entityTitle: "Organizações por Tema",
            });
        }

        await ThemeOrganizationModel.insert(parsed.data);
        return res.redirect(303, "/cms-ThemeOrganization-Q?msg=created");
    },

    async loadUpdatePage(req, res) {
        const id = parseId(req.params.id);
        const [item, lifeSpheres] = await Promise.all([
            ThemeOrganizationModel.selectById(id),
            LifeSphereModel.selectActiveOptionsWithColor(),
        ]);
        if (!item) {
            throw new HttpError(404, "Organização por tema não encontrada.");
        }

        return res.render("cms/cms-ThemeOrganization-U", {
            title: `Editar Organização por Tema nº ${id}`,
            itemId: id,
            values: {
                name: item.name,
                life_sphere_id: item.life_sphere_id ? String(item.life_sphere_id) : "",
                description: item.description || "",
                status: String(item.status),
            },
            lifeSpheres,
            errors: {},
            routePrefix: "cms-ThemeOrganization",
            entityName: "Organização por Tema",
            entityTitle: "Organizações por Tema",
        });
    },

    async updatePage(req, res) {
        const id = parseId(req.params.id);
        const parsed = themeOrganizationFormSchema.safeParse(req.body ?? {});
        if (!parsed.success) {
            const lifeSpheres = await LifeSphereModel.selectActiveOptionsWithColor();
            return res.status(422).render("cms/cms-ThemeOrganization-U", {
                title: `Editar Organização por Tema nº ${id}`,
                itemId: id,
                values: req.body ?? {},
                lifeSpheres,
                errors: toFieldErrors(parsed.error),
                routePrefix: "cms-ThemeOrganization",
                entityName: "Organização por Tema",
                entityTitle: "Organizações por Tema",
            });
        }

        const affected = await ThemeOrganizationModel.update(id, parsed.data);
        if (affected === 0) {
            throw new HttpError(404, "Organização por tema não encontrada.");
        }
        return res.redirect(303, "/cms-ThemeOrganization-Q?msg=updated");
    },

    async loadViewPage(req, res) {
        const id = parseId(req.params.id);
        const item = await ThemeOrganizationModel.selectById(id);
        if (!item) {
            throw new HttpError(404, "Organização por tema não encontrada.");
        }

        return res.render("cms/cms-ThemeOrganization-V", {
            title: `Visualizar Organização por Tema nº ${id}`,
            item,
            routePrefix: "cms-ThemeOrganization",
            entityName: "Organização por Tema",
            entityTitle: "Organizações por Tema",
        });
    },

    async deletePage(req, res) {
        const id = parseId(req.params.id);
        const affected = await ThemeOrganizationModel.deleteLogical(id);
        if (affected === 0) {
            throw new HttpError(404, "Organização por tema não encontrada.");
        }
        return res.redirect(303, "/cms-ThemeOrganization-Q?msg=deleted");
    },
};

// 7. Status de Atividade
const ActivityStatusController = createSimpleLookupController({
    model: ActivityStatusModel,
    entityName: "Status de Atividade",
    entityTitle: "Status de Atividade",
    routePrefix: "cms-ActivityStatus",
    formSchema: activityStatusFormSchema,
});

module.exports = {
    LifeSphereController,
    RelevanceController,
    DayPeriodController,
    PeriodicityController,
    ActionTypeController,
    ThemeOrganizationController,
    ActivityStatusController,
};
