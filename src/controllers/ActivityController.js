const Activity = require("../model/ActivityModel");
const { HttpError } = require("../errors/HttpError");
const {
    PAGE_SIZES,
    LIFE_SPHERES,
    RELEVANCE_OPTIONS,
    DAY_PERIODS,
    PERIODICITY_OPTIONS,
    ACTION_TYPES,
    activityListQuerySchema,
    activityFormSchema,
    idParamSchema,
    toFieldErrors,
    enrichActivity,
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

        const rawActivities = await Activity.selectActivities({
            ...criteria,
            limit: filter.perPage,
            offset,
        });

        const activities = rawActivities.map((act) => enrichActivity(act));

        return res.render("cms/cms-Activity-Q", {
            title: "Atividades",
            activities,
            filter,
            pageSizes: PAGE_SIZES,
            lifeSpheres: LIFE_SPHERES,
            relevanceOptions: RELEVANCE_OPTIONS,
            actionTypes: ACTION_TYPES,
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
        const rawActivity = await Activity.selectActivityById(id);
        if (!rawActivity) {
            throw new HttpError(404, "Atividade não encontrada.");
        }

        const activity = enrichActivity(rawActivity);

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
        return res.render("cms/cms-Activity-C", {
            title: "Nova Atividade",
            values: {
                status: "1",
                relevance: "Prioridade",
                next_activity_date: todayStr,
            },
            lifeSpheres: LIFE_SPHERES,
            relevanceOptions: RELEVANCE_OPTIONS,
            dayPeriods: DAY_PERIODS,
            periodicityOptions: PERIODICITY_OPTIONS,
            actionTypes: ACTION_TYPES,
            errors: {},
        });
    },

    async insertActivityPage(req, res) {
        const parsed = activityFormSchema.safeParse(req.body ?? {});
        if (!parsed.success) {
            return res.status(422).render("cms/cms-Activity-C", {
                title: "Nova Atividade",
                values: req.body ?? {},
                lifeSpheres: LIFE_SPHERES,
                relevanceOptions: RELEVANCE_OPTIONS,
                dayPeriods: DAY_PERIODS,
                periodicityOptions: PERIODICITY_OPTIONS,
                actionTypes: ACTION_TYPES,
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
        const activity = await Activity.selectActivityById(id);
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
            lifeSpheres: LIFE_SPHERES,
            relevanceOptions: RELEVANCE_OPTIONS,
            dayPeriods: DAY_PERIODS,
            periodicityOptions: PERIODICITY_OPTIONS,
            actionTypes: ACTION_TYPES,
            errors: {},
        });
    },

    async updateActivityPage(req, res) {
        const id = parseId(req.params.id);
        const parsed = activityFormSchema.safeParse(req.body ?? {});
        if (!parsed.success) {
            return res.status(422).render("cms/cms-Activity-U", {
                title: `Editar Atividade nº ${id}`,
                activityId: id,
                values: req.body ?? {},
                lifeSpheres: LIFE_SPHERES,
                relevanceOptions: RELEVANCE_OPTIONS,
                dayPeriods: DAY_PERIODS,
                periodicityOptions: PERIODICITY_OPTIONS,
                actionTypes: ACTION_TYPES,
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
