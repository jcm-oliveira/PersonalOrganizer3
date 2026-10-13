const Activity = require("../model/ActivityModel");
const {
    LifeSphereModel,
    RelevanceModel,
    DayPeriodModel,
    PeriodicityModel,
    ActionTypeModel,
    ThemeOrganizationModel,
    ActivityStatusModel,
} = require("../model/LookupModels");
const { HttpError } = require("../errors/HttpError");
const {
    PAGE_SIZES,
    LIFE_SPHERES_WITH_COLORS,
    LIFE_SPHERES,
    RELEVANCE_OPTIONS,
    DAY_PERIODS,
    PERIODICITY_OPTIONS,
    ACTION_TYPES,
    THEME_ORGANIZATIONS,
    activityListQuerySchema,
    activityFormSchema,
    idParamSchema,
    toFieldErrors,
    enrichActivity,
    getContrastTextColor,
} = require("../validation/activitySchemas");

const LIST_URL = "/cms-Activity-Q";

const MESSAGES = {
    created: { alertType: "alert-success", text: "Atividade inserida com sucesso." },
    updated: { alertType: "alert-success", text: "Atividade alterada com sucesso." },
    deleted: { alertType: "alert-warning", text: "Atividade excluída com sucesso." },
};

function messageFor(code) {
    return Object.hasOwn(MESSAGES, code) ? MESSAGES[code] : null;
}

function parseId(rawId) {
    const parsed = idParamSchema.safeParse(rawId);
    if (!parsed.success) {
        throw new HttpError(404, "Atividade não encontrada.");
    }
    return parsed.data;
}

function listUrl(filter, page) {
    const params = new URLSearchParams({
        status: filter.status,
        search: filter.search,
        lifeSphere: filter.lifeSphere,
        relevance: filter.relevance,
        actionType: filter.actionType,
        trafficLight: filter.trafficLight,
        perPage: String(filter.perPage),
        page: String(page),
    });
    return `${LIST_URL}?${params}`;
}

async function loadLookupOptions() {
    try {
        const [
            spheres,
            allSphereColors,
            relevances,
            periods,
            periodicities,
            actionTypes,
            themes,
            statuses,
        ] = await Promise.all([
            LifeSphereModel.selectActiveOptionsWithColor(),
            LifeSphereModel.selectAllWithColor(),
            RelevanceModel.selectActiveOptions(),
            DayPeriodModel.selectActiveOptions(),
            PeriodicityModel.selectActiveOptions(),
            ActionTypeModel.selectActiveOptions(),
            ThemeOrganizationModel.selectActiveOptions(),
            ActivityStatusModel.selectActiveOptionsWithStyle(),
        ]);

        const formattedThemes =
            themes.length > 0
                ? themes
                : THEME_ORGANIZATIONS.map((name, idx) => ({
                      id: idx + 1,
                      name,
                      life_sphere_name: null,
                  }));

        const spheresWithColor = spheres.length > 0 ? spheres : LIFE_SPHERES_WITH_COLORS;

        return {
            lifeSpheres: spheresWithColor.map((s) => s.name),
            lifeSpheresWithColor: spheresWithColor,
            // Cores de todas as esferas (ativas e inativas), usadas para pintar as linhas
            lifeSphereColors: allSphereColors.length > 0 ? allSphereColors : spheresWithColor,
            relevanceOptions: relevances.length ? relevances.map((r) => r.name) : RELEVANCE_OPTIONS,
            dayPeriods: periods.length ? periods.map((p) => p.name) : DAY_PERIODS,
            periodicityOptions: periodicities.length
                ? periodicities.map((p) => p.name)
                : PERIODICITY_OPTIONS,
            actionTypes: actionTypes.length ? actionTypes.map((a) => a.name) : ACTION_TYPES,
            themeOrganizations: formattedThemes,
            activityStatuses: statuses,
        };
    } catch {
        return {
            lifeSpheres: LIFE_SPHERES,
            lifeSpheresWithColor: LIFE_SPHERES_WITH_COLORS,
            lifeSphereColors: LIFE_SPHERES_WITH_COLORS,
            relevanceOptions: RELEVANCE_OPTIONS,
            dayPeriods: DAY_PERIODS,
            periodicityOptions: PERIODICITY_OPTIONS,
            actionTypes: ACTION_TYPES,
            themeOrganizations: THEME_ORGANIZATIONS.map((name, idx) => ({
                id: idx + 1,
                name,
                life_sphere_name: null,
            })),
            activityStatuses: [
                { id: 1, name: "Ativo", visibility: 1, color_code: "#28a745" },
                { id: 0, name: "Inativo", visibility: 0, color_code: "#343a40" },
            ],
        };
    }
}

function normalizeSphereName(name) {
    return String(name ?? "")
        .trim()
        .toLocaleLowerCase("pt-BR");
}

function buildSphereColorResolver(lifeSpheresWithColor) {
    const colorMap = new Map(
        (lifeSpheresWithColor || [])
            .filter((s) => s.color_code)
            .map((s) => [normalizeSphereName(s.name), s.color_code]),
    );
    return (sphereName) => {
        const color = colorMap.get(normalizeSphereName(sphereName)) || null;
        return { life_sphere_color: color, life_sphere_text_color: getContrastTextColor(color) };
    };
}

function getTodayString() {
    return new Date().toISOString().slice(0, 10);
}

module.exports = {
    //------------------------------------------------
    //          SHOW / LIST ROUTINE (Q + F)
    //------------------------------------------------

    async loadShowPage(req, res) {
        const filter = activityListQuerySchema.parse(req.query);
        const todayStr = getTodayString();

        const criteria = {
            status: filter.status === "all" ? null : Number(filter.status),
            search: filter.search,
            lifeSphere: filter.lifeSphere,
            relevance: filter.relevance,
            actionType: filter.actionType,
            trafficLight: filter.trafficLight,
            todayStr,
        };

        const total = await Activity.countActivities(criteria);
        const totalPages = Math.max(1, Math.ceil(total / filter.perPage));
        const page = Math.min(filter.page, totalPages);
        const offset = (page - 1) * filter.perPage;

        const [rawActivities, lookups] = await Promise.all([
            Activity.selectActivities({
                ...criteria,
                limit: filter.perPage,
                offset,
            }),
            loadLookupOptions(),
        ]);

        const statusMap = new Map((lookups.activityStatuses || []).map((s) => [s.id, s]));
        const resolveSphereColor = buildSphereColorResolver(lookups.lifeSphereColors);

        const activities = rawActivities.map((act) => {
            const enriched = enrichActivity(act);
            const statusObj = statusMap.get(act.status);
            const statusColor = statusObj?.color_code || (act.status === 1 ? "#28a745" : "#6c757d");
            return {
                ...enriched,
                status_name: statusObj?.name || (act.status === 1 ? "Ativo" : "Inativo"),
                status_color_code: statusColor,
                status_text_color: getContrastTextColor(statusColor) || "#ffffff",
                ...resolveSphereColor(act.life_sphere),
            };
        });

        return res.render("cms/cms-Activity-Q", {
            title: "Atividades",
            activities,
            filter,
            pageSizes: PAGE_SIZES,
            lifeSpheres: lookups.lifeSpheres,
            relevanceOptions: lookups.relevanceOptions,
            actionTypes: lookups.actionTypes,
            themeOrganizations: lookups.themeOrganizations,
            activityStatuses: lookups.activityStatuses,
            pagination: {
                page,
                totalPages,
                total,
                firstItem: total === 0 ? 0 : offset + 1,
                lastItem: offset + activities.length,
                previousUrl: page > 1 ? listUrl(filter, page - 1) : null,
                nextUrl: page < totalPages ? listUrl(filter, page + 1) : null,
            },
            message: messageFor(req.query.msg),
        });
    },

    //------------------------------------------------
    //                 VIEW ROUTINE (V)
    //------------------------------------------------

    async loadViewPage(req, res) {
        const id = parseId(req.params.id);
        const [rawActivity, lookups] = await Promise.all([
            Activity.selectActivityById(id),
            loadLookupOptions(),
        ]);
        if (!rawActivity) {
            throw new HttpError(404, "Atividade não encontrada.");
        }

        const statusMap = new Map((lookups.activityStatuses || []).map((s) => [s.id, s]));
        const resolveSphereColor = buildSphereColorResolver(lookups.lifeSphereColors);
        const enriched = enrichActivity(rawActivity);
        const statusObj = statusMap.get(rawActivity.status);
        const activity = {
            ...enriched,
            status_name: statusObj?.name || (rawActivity.status === 1 ? "Ativo" : "Inativo"),
            status_color_code:
                statusObj?.color_code || (rawActivity.status === 1 ? "#28a745" : "#6c757d"),
            ...resolveSphereColor(rawActivity.life_sphere),
        };

        return res.render("cms/cms-Activity-V", {
            title: `Visualizar Atividade nº ${id}`,
            activity,
        });
    },

    //------------------------------------------------
    //                 INSERT ROUTINE (C)
    //------------------------------------------------

    async loadInsertPage(req, res) {
        const todayStr = getTodayString();
        const lookups = await loadLookupOptions();
        return res.render("cms/cms-Activity-C", {
            title: "Nova Atividade",
            values: {
                status: "1",
                relevance: "Prioridade",
                next_activity_date: todayStr,
            },
            lifeSpheres: lookups.lifeSpheres,
            lifeSpheresWithColor: lookups.lifeSpheresWithColor,
            relevanceOptions: lookups.relevanceOptions,
            dayPeriods: lookups.dayPeriods,
            periodicityOptions: lookups.periodicityOptions,
            actionTypes: lookups.actionTypes,
            themeOrganizations: lookups.themeOrganizations,
            activityStatuses: lookups.activityStatuses,
            errors: {},
        });
    },

    async insertActivityPage(req, res) {
        const parsed = activityFormSchema.safeParse(req.body ?? {});
        if (!parsed.success) {
            const lookups = await loadLookupOptions();
            return res.status(422).render("cms/cms-Activity-C", {
                title: "Nova Atividade",
                values: req.body ?? {},
                lifeSpheres: lookups.lifeSpheres,
                lifeSpheresWithColor: lookups.lifeSpheresWithColor,
                relevanceOptions: lookups.relevanceOptions,
                dayPeriods: lookups.dayPeriods,
                periodicityOptions: lookups.periodicityOptions,
                actionTypes: lookups.actionTypes,
                themeOrganizations: lookups.themeOrganizations,
                activityStatuses: lookups.activityStatuses,
                errors: toFieldErrors(parsed.error),
            });
        }

        await Activity.insertActivity(parsed.data);
        return res.redirect(303, `${LIST_URL}?msg=created`);
    },

    //------------------------------------------------
    //                 UPDATE ROUTINE (U)
    //------------------------------------------------

    async loadUpdatePage(req, res) {
        const id = parseId(req.params.id);
        const [activity, lookups] = await Promise.all([
            Activity.selectActivityById(id),
            loadLookupOptions(),
        ]);
        if (!activity) {
            throw new HttpError(404, "Atividade não encontrada.");
        }

        const nextDate = activity.next_activity_date
            ? typeof activity.next_activity_date === "string"
                ? activity.next_activity_date.slice(0, 10)
                : new Date(activity.next_activity_date).toISOString().slice(0, 10)
            : "";

        const finalDate = activity.final_deadline
            ? typeof activity.final_deadline === "string"
                ? activity.final_deadline.slice(0, 10)
                : new Date(activity.final_deadline).toISOString().slice(0, 10)
            : "";

        const scheduledTime = activity.scheduled_time ? activity.scheduled_time.slice(0, 5) : "";

        return res.render("cms/cms-Activity-U", {
            title: `Editar Atividade nº ${id}`,
            activityId: id,
            values: {
                life_sphere: activity.life_sphere,
                description: activity.description,
                relevance: activity.relevance,
                next_activity_date: nextDate,
                final_deadline: finalDate,
                day_period: activity.day_period || "",
                scheduled_time: scheduledTime,
                periodicity: activity.periodicity || "",
                action_type: activity.action_type || "",
                theme_organization: activity.theme_organization || "",
                notes: activity.notes || "",
                status: String(activity.status),
            },
            lifeSpheres: lookups.lifeSpheres,
            lifeSpheresWithColor: lookups.lifeSpheresWithColor,
            relevanceOptions: lookups.relevanceOptions,
            dayPeriods: lookups.dayPeriods,
            periodicityOptions: lookups.periodicityOptions,
            actionTypes: lookups.actionTypes,
            themeOrganizations: lookups.themeOrganizations,
            activityStatuses: lookups.activityStatuses,
            errors: {},
        });
    },

    async updateActivityPage(req, res) {
        const id = parseId(req.params.id);
        const parsed = activityFormSchema.safeParse(req.body ?? {});
        if (!parsed.success) {
            const lookups = await loadLookupOptions();
            return res.status(422).render("cms/cms-Activity-U", {
                title: `Editar Atividade nº ${id}`,
                activityId: id,
                values: req.body ?? {},
                lifeSpheres: lookups.lifeSpheres,
                lifeSpheresWithColor: lookups.lifeSpheresWithColor,
                relevanceOptions: lookups.relevanceOptions,
                dayPeriods: lookups.dayPeriods,
                periodicityOptions: lookups.periodicityOptions,
                actionTypes: lookups.actionTypes,
                themeOrganizations: lookups.themeOrganizations,
                activityStatuses: lookups.activityStatuses,
                errors: toFieldErrors(parsed.error),
            });
        }

        const affectedRows = await Activity.updateActivity(id, parsed.data);
        if (affectedRows === 0) {
            throw new HttpError(404, "Atividade não encontrada.");
        }
        return res.redirect(303, `${LIST_URL}?msg=updated`);
    },

    //------------------------------------------------
    //                 DELETE ROUTINE (D)
    //------------------------------------------------

    async deleteActivityPage(req, res) {
        const id = parseId(req.params.id);
        const affectedRows = await Activity.deleteActivity(id);
        if (affectedRows === 0) {
            throw new HttpError(404, "Atividade não encontrada.");
        }
        return res.redirect(303, `${LIST_URL}?msg=deleted`);
    },
};
