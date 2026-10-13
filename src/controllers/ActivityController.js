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
    DEFAULT_ACTIVITY_STATUS_ID,
    STATUS_FILTER_VISIBLE,
    STATUS_FILTER_ALL,
    LIFE_SPHERES_WITH_COLORS,
    LIFE_SPHERES,
    RELEVANCE_OPTIONS,
    DAY_PERIODS,
    PERIODICITY_OPTIONS,
    ACTION_TYPES,
    THEME_ORGANIZATIONS,
    activityListQuerySchema,
    activityFormSchema,
    activityRescheduleSchema,
    activityStatusChangeSchema,
    calendarRangeQuerySchema,
    calendarRescheduleSchema,
    idParamSchema,
    toFieldErrors,
    enrichActivity,
    getContrastTextColor,
    toDateOnlyString,
} = require("../validation/activitySchemas");

const LIST_URL = "/cms-Activity-Q";

const MESSAGES = {
    created: { alertType: "alert-success", text: "Atividade inserida com sucesso." },
    updated: { alertType: "alert-success", text: "Atividade alterada com sucesso." },
    deleted: { alertType: "alert-warning", text: "Atividade excluída com sucesso." },
    rescheduled: { alertType: "alert-success", text: "Atividade remarcada com sucesso." },
    statusChanged: {
        alertType: "alert-success",
        text: "Status da atividade alterado com sucesso.",
    },
    invalidDate: {
        alertType: "alert-danger",
        text: "Data inválida. Informe a nova data da próxima atividade.",
    },
    invalidStatus: {
        alertType: "alert-danger",
        text: "Status inválido. Selecione um status do cadastro de Status de Atividade.",
    },
};

function messageFor(code) {
    return Object.hasOwn(MESSAGES, code) ? MESSAGES[code] : null;
}

// Volta para a consulta mantendo os filtros/página de origem. Só aceita a própria
// tela de consulta como destino (evita redirecionamento aberto).
function returnToListUrl(returnTo, msgCode) {
    const isListPath = typeof returnTo === "string" && /^\/cms-Activity-Q(\?|$)/.test(returnTo);
    const url = new URL(isListPath ? returnTo : LIST_URL, "http://localhost");
    if (url.pathname !== LIST_URL) {
        return `${LIST_URL}?msg=${msgCode}`;
    }
    url.searchParams.set("msg", msgCode);
    return `${url.pathname}${url.search}`;
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

//------------------------------------------------
//        GRÁFICOS DO DASHBOARD (barras horizontais)
//------------------------------------------------

const CHART_DEFAULT_COLOR = "#007bff"; // Uma cor só quando a cor não identifica a categoria
const CHART_NEUTRAL_COLOR = "#adb5bd";

const SCHEDULE_BUCKETS = [
    {
        key: "ATRASADO",
        label: "Atrasado",
        color: "#dc3545",
        icon: "fa-exclamation-circle",
        trafficLight: "ATRASADA",
    },
    { key: "HOJE", label: "Hoje", color: "#fd7e14", icon: "fa-clock", trafficLight: "HOJE" },
    { key: "AMANHA", label: "Amanhã", color: CHART_DEFAULT_COLOR },
    { key: "ATE_7", label: "De 2 a 7 dias", color: CHART_DEFAULT_COLOR },
    { key: "ATE_15", label: "De 8 a 15 dias", color: CHART_DEFAULT_COLOR },
    { key: "MAIS_15", label: "Mais de 15 dias", color: CHART_DEFAULT_COLOR },
];

function listLink(params) {
    return `${LIST_URL}?${new URLSearchParams({ status: "visible", ...params })}`;
}

// Monta um gráfico: percentual sobre o total e largura relativa à maior barra
function buildChart({ key, title, subtitle, icon, rows, sortByTotal = true }) {
    const total = rows.reduce((sum, r) => sum + r.total, 0);
    const max = Math.max(0, ...rows.map((r) => r.total));
    const sorted = sortByTotal
        ? [...rows].sort((a, b) => b.total - a.total || a.label.localeCompare(b.label, "pt-BR"))
        : rows;
    return {
        key,
        title,
        subtitle,
        icon,
        total,
        rows: sorted.map((r) => ({
            ...r,
            percent: total > 0 ? Math.round((r.total / total) * 100) : 0,
            width: max > 0 ? Math.round((r.total / max) * 1000) / 10 : 0,
        })),
    };
}

// Junta as contagens com o cadastro, para que categorias sem atividade apareçam com 0
function withZeroRows(names, counts) {
    const byName = new Map(counts.map((c) => [normalizeSphereName(c.label), c]));
    const rows = names.map((name) => ({
        label: name,
        total: byName.get(normalizeSphereName(name))?.total || 0,
    }));
    const known = new Set(names.map(normalizeSphereName));
    counts
        .filter((c) => !known.has(normalizeSphereName(c.label)))
        .forEach((c) => rows.push({ label: String(c.label), total: c.total }));
    return rows;
}

function buildDashboardCharts(distribution, lookups) {
    const resolveSphereColor = buildSphereColorResolver(lookups.lifeSphereColors);

    const sphereRows = withZeroRows(lookups.lifeSpheres || [], distribution.bySphere).map((r) => ({
        ...r,
        color: resolveSphereColor(r.label).life_sphere_color || CHART_NEUTRAL_COLOR,
        href: listLink({ lifeSphere: r.label }),
    }));

    const statuses = lookups.activityStatuses || [];
    const statusCounts = new Map(distribution.byStatus.map((s) => [s.statusId, s.total]));
    const statusRows = statuses.map((st) => ({
        label: st.name,
        total: statusCounts.get(st.id) || 0,
        color: st.color_code || CHART_NEUTRAL_COLOR,
        href: `${LIST_URL}?status=${st.id}`,
    }));
    distribution.byStatus
        .filter((s) => !statuses.some((st) => st.id === s.statusId))
        .forEach((s) =>
            statusRows.push({
                label: `Status nº ${s.statusId}`,
                total: s.total,
                color: CHART_NEUTRAL_COLOR,
            }),
        );

    const actionRows = withZeroRows(lookups.actionTypes || [], distribution.byActionType).map(
        (r) => ({
            ...r,
            color: CHART_DEFAULT_COLOR,
            href: r.label === "Não informado" ? undefined : listLink({ actionType: r.label }),
        }),
    );

    const relevanceRows = withZeroRows(
        lookups.relevanceOptions || [],
        distribution.byRelevance,
    ).map((r) => ({ ...r, color: CHART_DEFAULT_COLOR, href: listLink({ relevance: r.label }) }));

    const scheduleCounts = new Map(distribution.bySchedule.map((b) => [b.bucket, b.total]));
    const scheduleRows = SCHEDULE_BUCKETS.map((b) => ({
        label: b.label,
        total: scheduleCounts.get(b.key) || 0,
        color: b.color,
        icon: b.icon,
        href: b.trafficLight ? listLink({ trafficLight: b.trafficLight }) : undefined,
    }));

    const visibleNote = "Atividades com status visíveis por padrão";
    return [
        buildChart({
            key: "sphere",
            title: "Esfera da Vida",
            subtitle: visibleNote,
            icon: "fa-heart",
            rows: sphereRows,
        }),
        buildChart({
            key: "status",
            title: "Status",
            subtitle: "Todas as atividades",
            icon: "fa-sync-alt",
            rows: statusRows,
        }),
        buildChart({
            key: "actionType",
            title: "Tipo de Ação",
            subtitle: visibleNote,
            icon: "fa-layer-group",
            rows: actionRows,
        }),
        buildChart({
            key: "relevance",
            title: "Relevância",
            subtitle: visibleNote,
            icon: "fa-flag",
            rows: relevanceRows,
            sortByTotal: false,
        }),
        buildChart({
            key: "schedule",
            title: "Próxima atividade",
            subtitle: `${visibleNote}, pela data da próxima atividade`,
            icon: "fa-calendar-day",
            rows: scheduleRows,
            sortByTotal: false,
        }),
    ];
}

// "all" = sem filtro | "visible" = status visíveis por padrão | número = id do status
function toStatusCriteria(status) {
    if (status === STATUS_FILTER_ALL) return null;
    if (status === STATUS_FILTER_VISIBLE) return STATUS_FILTER_VISIBLE;
    return Number(status);
}

function getTodayString() {
    return toDateOnlyString(new Date());
}

module.exports = {
    //------------------------------------------------
    //          SHOW / LIST ROUTINE (Q + F)
    //------------------------------------------------

    async loadShowPage(req, res) {
        const filter = activityListQuerySchema.parse(req.query);
        const todayStr = getTodayString();

        const criteria = {
            status: toStatusCriteria(filter.status),
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
            returnTo: listUrl(filter, page),
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
                status: String(DEFAULT_ACTIVITY_STATUS_ID),
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

        const nextDate = toDateOnlyString(activity.next_activity_date) || "";
        const finalDate = toDateOnlyString(activity.final_deadline) || "";

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
    //            CALENDÁRIO (FullCalendar)
    //------------------------------------------------

    //------------------------------------------------
    //        DASHBOARD (quadrante + gráficos)
    //------------------------------------------------

    async loadDashboardPage(req, res) {
        const todayStr = getTodayString();
        const [stats, distribution, lookups] = await Promise.all([
            Activity.getActivityStats(todayStr),
            Activity.getActivityDistribution(todayStr),
            loadLookupOptions(),
        ]);

        return res.render("dashboard", {
            title: "Dashboard",
            stats,
            charts: buildDashboardCharts(distribution, lookups),
        });
    },

    async loadCalendarPage(req, res) {
        const lookups = await loadLookupOptions();
        return res.render("cms/cms-Calendar", {
            title: "Calendário",
            lifeSphereColors: (lookups.lifeSphereColors || []).filter((s) => s.color_code),
            activityStatuses: lookups.activityStatuses,
        });
    },

    // Fonte de eventos JSON consumida pelo FullCalendar (?start=...&end=...&status=...).
    // Cada atividade gera até dois eventos: a próxima atividade (pode ser arrastada
    // para remarcar) e o prazo final (marcador, somente leitura).
    async loadCalendarEvents(req, res) {
        const parsed = calendarRangeQuerySchema.safeParse(req.query);
        if (!parsed.success) {
            throw new HttpError(400, "Intervalo de datas inválido.");
        }
        const { start, end } = parsed.data;
        const inRange = (date) => Boolean(date) && date >= start && date < end;

        const [rawActivities, lookups] = await Promise.all([
            Activity.selectActivitiesForCalendar({
                start,
                end,
                status: toStatusCriteria(parsed.data.status),
            }),
            loadLookupOptions(),
        ]);

        const statusMap = new Map((lookups.activityStatuses || []).map((s) => [s.id, s]));
        const resolveSphereColor = buildSphereColorResolver(lookups.lifeSphereColors);

        const events = rawActivities.flatMap((act) => {
            const nextDate = toDateOnlyString(act.next_activity_date);
            const finalDate = toDateOnlyString(act.final_deadline);
            const time = act.scheduled_time ? String(act.scheduled_time).slice(0, 8) : null;
            const { life_sphere_color: color, life_sphere_text_color: textColor } =
                resolveSphereColor(act.life_sphere);
            const extendedProps = {
                activityId: act.id,
                lifeSphere: act.life_sphere,
                relevance: act.relevance,
                status: statusMap.get(act.status)?.name || null,
            };
            const result = [];

            if (inRange(nextDate)) {
                result.push({
                    id: String(act.id),
                    title: act.description,
                    start: time ? `${nextDate}T${time}` : nextDate,
                    allDay: !time,
                    url: `/cms-Activity-V/${act.id}`,
                    editable: true,
                    ...(color ? { backgroundColor: color, borderColor: color, textColor } : {}),
                    extendedProps: { ...extendedProps, kind: "next" },
                });
            }

            if (inRange(finalDate)) {
                result.push({
                    id: `deadline-${act.id}`,
                    title: `Prazo final: ${act.description}`,
                    start: finalDate,
                    allDay: true,
                    url: `/cms-Activity-V/${act.id}`,
                    editable: false,
                    classNames: ["fc-event-deadline"],
                    ...(color ? { borderColor: color } : {}),
                    extendedProps: { ...extendedProps, kind: "deadline" },
                });
            }

            return result;
        });

        return res.json(events);
    },

    // Remarcação ao arrastar e soltar no calendário (JSON)
    async rescheduleCalendarEvent(req, res) {
        const id = parseId(req.params.id);
        const parsed = calendarRescheduleSchema.safeParse(req.body ?? {});
        if (!parsed.success) {
            return res.status(422).json({ ok: false, errors: toFieldErrors(parsed.error) });
        }

        const { next_activity_date: date, scheduled_time: time } = parsed.data;
        const affectedRows = time
            ? await Activity.updateNextActivitySchedule(id, date, time)
            : await Activity.updateNextActivityDate(id, date);
        if (affectedRows === 0) {
            return res.status(404).json({ ok: false, message: "Atividade não encontrada." });
        }
        return res.json({ ok: true });
    },

    //------------------------------------------------
    //      REMARCAR ATIVIDADE (pop-up da consulta)
    //------------------------------------------------

    async rescheduleActivityPage(req, res) {
        const id = parseId(req.params.id);
        const returnTo = req.body?.returnTo;
        const parsed = activityRescheduleSchema.safeParse(req.body ?? {});
        if (!parsed.success) {
            return res.redirect(303, returnToListUrl(returnTo, "invalidDate"));
        }

        const affectedRows = await Activity.updateNextActivityDate(
            id,
            parsed.data.next_activity_date,
        );
        if (affectedRows === 0) {
            throw new HttpError(404, "Atividade não encontrada.");
        }
        return res.redirect(303, returnToListUrl(returnTo, "rescheduled"));
    },

    //------------------------------------------------
    //     STATUS DA ATIVIDADE (pop-up da consulta)
    //------------------------------------------------

    async changeActivityStatusPage(req, res) {
        const id = parseId(req.params.id);
        const returnTo = req.body?.returnTo;
        const parsed = activityStatusChangeSchema.safeParse(req.body ?? {});
        const lookups = await loadLookupOptions();
        const statusExists =
            parsed.success &&
            (lookups.activityStatuses || []).some((s) => s.id === parsed.data.status);
        if (!statusExists) {
            return res.redirect(303, returnToListUrl(returnTo, "invalidStatus"));
        }

        const affectedRows = await Activity.updateActivityStatus(id, parsed.data.status);
        if (affectedRows === 0) {
            throw new HttpError(404, "Atividade não encontrada.");
        }
        return res.redirect(303, returnToListUrl(returnTo, "statusChanged"));
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
