const Activity = require("../model/ActivityModel");
const {
    LifeSphereModel,
    ActivityTypeModel,
    DayPeriodModel,
    ActionTypeModel,
    ThemeOrganizationModel,
    ActivityStatusModel,
} = require("../model/LookupModels");
const { HttpError } = require("../errors/HttpError");
const { can } = require("../security/permissions");
const {
    PAGE_SIZES,
    DEFAULT_ACTIVITY_STATUS_ID,
    DEFAULT_NOTIFY_BEFORE_MINUTES,
    NOTIFY_BEFORE_OPTIONS,
    NOTIFY_BEFORE_MAX_DAYS,
    STATUS_FILTER_VISIBLE,
    STATUS_FILTER_ALL,
    LIFE_SPHERES_WITH_COLORS,
    LIFE_SPHERES,
    ACTIVITY_TYPE_PROGRAMMED,
    ACTIVITY_TYPE_SERVICE_ORDER,
    ACTIVITY_TYPE_SHOPPING_LIST,
    UNDATED_ACTIVITY_TYPES,
    ACTIVITY_TYPE_OPTIONS,
    DAY_PERIODS,
    ACTION_TYPES,
    THEME_ORGANIZATIONS,
    activityListQuerySchema,
    BLOCK_FILTER_FIELDS,
    blockParamName,
    parseBlockFilter,
    DEFAULT_PAGE_SIZE,
    activityFormSchema,
    activityRescheduleSchema,
    activityStatusChangeSchema,
    calendarRangeQuerySchema,
    calendarRescheduleSchema,
    activityNotifyBeforeSchema,
    idParamSchema,
    toFieldErrors,
    enrichActivity,
    applyInProgressLight,
    getContrastTextColor,
    toDateOnlyString,
    addDurationToDateTime,
    getOverdueReference,
} = require("../validation/activitySchemas");
const {
    buildRecurrence,
    nextOccurrence,
    occurrencesBetween,
    ruleToFormValues,
    describeRecurrence,
} = require("../validation/recurrence");

const LIST_URL = "/cms-Activity-Q";
// Todas as atividades (todos os tipos), sem a divisão em blocos
const ALL_LIST_URL = "/cms-Activity-L";

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
        text: "Data ou horário inválido. Informe a nova data (e, se quiser, o horário) da próxima atividade.",
    },
    occurrenceDone: {
        alertType: "alert-success",
        text: "Ocorrência concluída. A atividade foi remarcada para a próxima ocorrência.",
    },
    seriesEnded: {
        alertType: "alert-warning",
        text: "Esta foi a última ocorrência da repetição. Não há próximas ocorrências; altere o status da atividade se ela estiver concluída.",
    },
    notRecurring: {
        alertType: "alert-danger",
        text: "Esta atividade não é recorrente.",
    },
    invalidStatus: {
        alertType: "alert-danger",
        text: "Status inválido. Selecione um status do cadastro de Status de Atividade.",
    },
};

function messageFor(code) {
    return Object.hasOwn(MESSAGES, code) ? MESSAGES[code] : null;
}

// Consulta de origem para os botões "Voltar" e campos ocultos de cadastro/edição: só as
// telas de consulta (por blocos ou todas as atividades); senão, a consulta por blocos.
function safeListReturn(value) {
    return typeof value === "string" && /^\/cms-Activity-[QL](\?|$)/.test(value) ? value : LIST_URL;
}

// Volta para a tela de consulta de origem (por blocos ou todas as atividades), mantendo
// filtros/página. Só aceita essas telas como destino (evita redirecionamento aberto).
// msgCode é opcional.
function returnToListUrl(returnTo, msgCode) {
    const isListPath = typeof returnTo === "string" && /^\/cms-Activity-[QL](\?|$)/.test(returnTo);
    const url = new URL(isListPath ? returnTo : LIST_URL, "http://localhost");
    if (url.pathname !== LIST_URL && url.pathname !== ALL_LIST_URL) {
        return msgCode ? `${LIST_URL}?msg=${msgCode}` : LIST_URL;
    }
    if (msgCode) url.searchParams.set("msg", msgCode);
    else url.searchParams.delete("msg");
    return `${url.pathname}${url.search}`;
}

function parseId(rawId) {
    const parsed = idParamSchema.safeParse(rawId);
    if (!parsed.success) {
        throw new HttpError(404, "Atividade não encontrada.");
    }
    return parsed.data;
}

// Blocos da consulta: "Programada" à esquerda (também com qualquer outro tipo) e, à
// direita, "Ordem de Serviço" e "Lista de Compras". Cada bloco tem o próprio filtro e a
// própria página. Programadas usa os parâmetros sem prefixo (search, trafficLight, page...,
// também usados pelos links do dashboard); os demais, o prefixo do bloco (serviceSearch,
// pageService...).
const LIST_BLOCKS = [
    {
        key: "programmed",
        title: "Atividades Programadas",
        icon: "far fa-calendar-check",
        filterPrefix: null,
        criteria: { activityTypeNotIn: [ACTIVITY_TYPE_SERVICE_ORDER, ACTIVITY_TYPE_SHOPPING_LIST] },
    },
    {
        key: "service",
        title: "Ordens de Serviço",
        icon: "fas fa-wrench",
        filterPrefix: "service",
        // Sequência manual (setas para subir/descer)
        criteria: { activityTypeIn: [ACTIVITY_TYPE_SERVICE_ORDER], manualOrder: true },
        sortable: true,
    },
    {
        key: "shopping",
        title: "Lista de Compras",
        icon: "fas fa-shopping-cart",
        filterPrefix: "shopping",
        criteria: { activityTypeIn: [ACTIVITY_TYPE_SHOPPING_LIST], manualOrder: true },
        sortable: true,
    },
];

// Campos do filtro do bloco Programadas na URL (sem prefixo)
const PROGRAMMED_FILTER_FIELDS = [
    "status",
    "search",
    "lifeSphere",
    "activityType",
    "actionType",
    "trafficLight",
    "perPage",
    "page",
];
// Valores padrão dos filtros (não vão para a URL); os demais campos, vazio
const FILTER_DEFAULTS = { status: STATUS_FILTER_VISIBLE, perPage: DEFAULT_PAGE_SIZE, page: 1 };

/** Lê da URL o filtro de um bloco da consulta */
function parseListBlockFilter(block, query) {
    return block.filterPrefix
        ? parseBlockFilter(query, block.filterPrefix)
        : activityListQuerySchema.parse(query ?? {});
}

/** Parâmetros de URL do filtro de um bloco, só os diferentes do padrão: [[nome, valor]] */
function blockUrlParams(block, filter) {
    const fields = block.filterPrefix ? [...BLOCK_FILTER_FIELDS, "page"] : PROGRAMMED_FILTER_FIELDS;
    return fields.flatMap((field) => {
        const value = filter[field];
        if (value === undefined || value === "" || value === (FILTER_DEFAULTS[field] ?? "")) {
            return [];
        }
        const name = block.filterPrefix ? blockParamName(block.filterPrefix, field) : field;
        return [[name, String(value)]];
    });
}

/** Endereço da consulta por blocos com o filtro de cada bloco (filters: { programmed, ... }) */
function listUrl(filters) {
    const query = new URLSearchParams(
        LIST_BLOCKS.flatMap((block) => blockUrlParams(block, filters[block.key])),
    ).toString();
    return query ? `${LIST_URL}?${query}` : LIST_URL;
}

/** Critérios de consulta de um bloco a partir do filtro dele */
function listBlockCriteria(block, filter) {
    const base = block.filterPrefix
        ? {
              ...listCriteria({
                  status: filter.status,
                  search: filter.search,
                  lifeSphere: filter.lifeSphere,
              }),
              themeOrganization: filter.themeOrganization,
          }
        : listCriteria(filter);
    return { ...base, ...block.criteria };
}

// Endereço da tela com todas as atividades, mantendo o filtro
function allListUrl(filter, page) {
    const params = new URLSearchParams({
        status: filter.status,
        search: filter.search,
        lifeSphere: filter.lifeSphere,
        activityType: filter.activityType,
        actionType: filter.actionType,
        trafficLight: filter.trafficLight,
        perPage: String(filter.perPage),
        page: String(page),
    });
    return `${ALL_LIST_URL}?${params}`;
}

async function loadLookupOptions() {
    try {
        const [spheres, allSphereColors, activityTypes, periods, actionTypes, themes, statuses] =
            await Promise.all([
                LifeSphereModel.selectActiveOptionsWithColor(),
                LifeSphereModel.selectAllWithColor(),
                ActivityTypeModel.selectActiveOptions(),
                DayPeriodModel.selectActiveOptions(),
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
            activityTypeOptions: activityTypes.length
                ? activityTypes.map((r) => r.name)
                : ACTIVITY_TYPE_OPTIONS,
            dayPeriods: periods.length ? periods.map((p) => p.name) : DAY_PERIODS,
            actionTypes: actionTypes.length ? actionTypes.map((a) => a.name) : ACTION_TYPES,
            themeOrganizations: formattedThemes,
            activityStatuses: statuses,
        };
    } catch {
        return {
            lifeSpheres: LIFE_SPHERES,
            lifeSpheresWithColor: LIFE_SPHERES_WITH_COLORS,
            lifeSphereColors: LIFE_SPHERES_WITH_COLORS,
            activityTypeOptions: ACTIVITY_TYPE_OPTIONS,
            dayPeriods: DAY_PERIODS,
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

    const activityTypeRows = withZeroRows(
        lookups.activityTypeOptions || [],
        distribution.byActivityType,
    ).map((r) => ({ ...r, color: CHART_DEFAULT_COLOR, href: listLink({ activityType: r.label }) }));

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
            key: "activity_type",
            title: "Tipo de Atividade",
            subtitle: visibleNote,
            icon: "fa-flag",
            rows: activityTypeRows,
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

// Valida o formulário de atividade e a recorrência. Com recorrência, a próxima
// atividade é alinhada à primeira ocorrência válida da regra. A data é opcional,
// exceto na atividade recorrente, em que ela é o início da série.
function parseActivityForm(body) {
    const parsed = activityFormSchema.safeParse(body ?? {});
    const errors = parsed.success ? {} : toFieldErrors(parsed.error);
    const startDate = parsed.success ? parsed.data.next_activity_date : null;
    let recurrence = null;
    if (startDate) {
        recurrence = buildRecurrence(body, startDate);
    } else if (parsed.success && body?.recurrence_freq) {
        errors.next_activity_date = "Informe a data da próxima atividade para usar a repetição.";
    } else {
        recurrence = { rule: null, nextActivityDate: null };
    }
    if (recurrence?.error) errors.recurrence = recurrence.error;

    if (Object.keys(errors).length > 0) {
        return { success: false, errors };
    }
    const nextActivityDate = recurrence.nextActivityDate;
    return {
        success: true,
        data: {
            ...parsed.data,
            // Ordem de Serviço e Lista de Compras não têm data: com data, é Programada
            activity_type:
                nextActivityDate && UNDATED_ACTIVITY_TYPES.includes(parsed.data.activity_type)
                    ? ACTIVITY_TYPE_PROGRAMMED
                    : parsed.data.activity_type,
            next_activity_date: nextActivityDate,
            recurrence_rule: recurrence.rule,
        },
    };
}

// Campos de recorrência exibidos na consulta e na visualização
function recurrenceInfo(act) {
    if (!act.recurrence_rule) return { recurrence_description: null, next_occurrence_date: null };
    const currentDate = toDateOnlyString(act.next_activity_date);
    return {
        recurrence_description: describeRecurrence(act.recurrence_rule),
        next_occurrence_date: currentDate ? nextOccurrence(act.recurrence_rule, currentDate) : null,
    };
}

// Critérios das telas de consulta a partir do filtro. Mesma referência do farol:
// atrasada também a de hoje com início + 5 min já passado.
function listCriteria(filter) {
    const { todayStr, overdueTime } = getOverdueReference();
    return {
        status: toStatusCriteria(filter.status),
        search: filter.search,
        lifeSphere: filter.lifeSphere,
        activityType: filter.activityType,
        actionType: filter.actionType,
        trafficLight: filter.trafficLight,
        todayStr,
        overdueTime,
    };
}

// Campos exibidos nas telas de consulta: farol, status (nome e cores), cor da esfera e repetição
function buildListDecorator(lookups) {
    const statusMap = new Map((lookups.activityStatuses || []).map((s) => [s.id, s]));
    const resolveSphereColor = buildSphereColorResolver(lookups.lifeSphereColors);
    return (act) => {
        const statusObj = statusMap.get(act.status);
        const enriched = applyInProgressLight(enrichActivity(act), statusObj?.name);
        const statusColor = statusObj?.color_code || (act.status === 1 ? "#28a745" : "#6c757d");
        return {
            ...enriched,
            status_name: statusObj?.name || (act.status === 1 ? "Ativo" : "Inativo"),
            status_color_code: statusColor,
            status_text_color: getContrastTextColor(statusColor) || "#ffffff",
            ...resolveSphereColor(act.life_sphere),
            ...recurrenceInfo(act),
        };
    };
}

// Atividade com os campos calculados exibidos na visualização (página e pop-up)
async function loadActivityForView(rawId) {
    const id = parseId(rawId);
    const [rawActivity, lookups] = await Promise.all([
        Activity.selectActivityById(id),
        loadLookupOptions(),
    ]);
    if (!rawActivity) {
        throw new HttpError(404, "Atividade não encontrada.");
    }

    const statusMap = new Map((lookups.activityStatuses || []).map((s) => [s.id, s]));
    const resolveSphereColor = buildSphereColorResolver(lookups.lifeSphereColors);
    const statusObj = statusMap.get(rawActivity.status);
    return {
        ...applyInProgressLight(enrichActivity(rawActivity), statusObj?.name),
        status_name: statusObj?.name || (rawActivity.status === 1 ? "Ativo" : "Inativo"),
        status_color_code:
            statusObj?.color_code || (rawActivity.status === 1 ? "#28a745" : "#6c757d"),
        ...resolveSphereColor(rawActivity.life_sphere),
        ...recurrenceInfo(rawActivity),
    };
}

// "all" = sem filtro | "visible" = status visíveis por padrão | número = id do status
function toStatusCriteria(status) {
    if (status === STATUS_FILTER_ALL) return null;
    if (status === STATUS_FILTER_VISIBLE) return STATUS_FILTER_VISIBLE;
    return Number(status);
}

module.exports = {
    //------------------------------------------------
    //          SHOW / LIST ROUTINE (Q + F)
    //------------------------------------------------

    async loadShowPage(req, res) {
        // Cada bloco com o próprio filtro (e página)
        const filters = {};
        LIST_BLOCKS.forEach((block) => {
            filters[block.key] = parseListBlockFilter(block, req.query);
        });

        // Total de cada bloco e página válida de cada um
        const totals = await Promise.all(
            LIST_BLOCKS.map((block) =>
                Activity.countActivities(listBlockCriteria(block, filters[block.key])),
            ),
        );
        LIST_BLOCKS.forEach((block, i) => {
            const filter = filters[block.key];
            const totalPages = Math.max(1, Math.ceil(totals[i] / filter.perPage));
            filter.page = Math.min(filter.page, totalPages);
        });

        const [lookups, ...blockRows] = await Promise.all([
            loadLookupOptions(),
            ...LIST_BLOCKS.map((block) => {
                const filter = filters[block.key];
                return Activity.selectActivities({
                    ...listBlockCriteria(block, filter),
                    limit: filter.perPage,
                    offset: (filter.page - 1) * filter.perPage,
                });
            }),
        ]);

        const decorate = buildListDecorator(lookups);

        // Blocos por chave (programmed, service, shopping), cada um com o seu filtro e a
        // sua paginação; os links de um bloco mantêm o filtro e a página dos outros
        const blocks = {};
        LIST_BLOCKS.forEach((block, i) => {
            const filter = filters[block.key];
            const total = totals[i];
            const { page, perPage } = filter;
            const totalPages = Math.max(1, Math.ceil(total / perPage));
            const offset = (page - 1) * perPage;
            const activities = blockRows[i].map(decorate);
            const urlFor = (target) =>
                listUrl({ ...filters, [block.key]: { ...filter, page: target } });
            blocks[block.key] = {
                key: block.key,
                title: block.title,
                icon: block.icon,
                sortable: Boolean(block.sortable),
                activities,
                filterPrefix: block.filterPrefix,
                filter,
                filterActive: blockUrlParams(block, { ...filter, page: 1 }).length > 0,
                // "Limpar": só o filtro deste bloco volta ao padrão
                clearUrl: listUrl({ ...filters, [block.key]: parseListBlockFilter(block, {}) }),
                // Campos ocultos do pop-up de filtro: filtros e páginas dos outros blocos
                preserve: LIST_BLOCKS.filter((other) => other !== block).flatMap((other) =>
                    blockUrlParams(other, filters[other.key]),
                ),
                pagination: {
                    page,
                    totalPages,
                    total,
                    firstItem: total === 0 ? 0 : offset + 1,
                    lastItem: offset + activities.length,
                    previousUrl: page > 1 ? urlFor(page - 1) : null,
                    nextUrl: page < totalPages ? urlFor(page + 1) : null,
                },
            };
        });

        return res.render("cms/cms-Activity-Q", {
            title: "Atividades",
            blocks,
            pageSizes: PAGE_SIZES,
            lifeSpheres: lookups.lifeSpheres,
            activityTypeOptions: lookups.activityTypeOptions,
            actionTypes: lookups.actionTypes,
            themeOrganizations: lookups.themeOrganizations,
            activityStatuses: lookups.activityStatuses,
            returnTo: listUrl(filters),
            message: messageFor(req.query.msg),
        });
    },

    // Todas as atividades (ícone de banco de dados no menu): uma tabela só, com todos os
    // tipos e, por padrão, todos os status; mesmo filtro e mesmas ações da consulta.
    async loadAllPage(req, res) {
        const filter = activityListQuerySchema.parse({ status: STATUS_FILTER_ALL, ...req.query });
        const criteria = listCriteria(filter);

        const total = await Activity.countActivities(criteria);
        const totalPages = Math.max(1, Math.ceil(total / filter.perPage));
        const page = Math.min(filter.page, totalPages);
        const offset = (page - 1) * filter.perPage;

        const [lookups, rows] = await Promise.all([
            loadLookupOptions(),
            Activity.selectActivities({ ...criteria, limit: filter.perPage, offset }),
        ]);
        const activities = rows.map(buildListDecorator(lookups));

        return res.render("cms/cms-Activity-L", {
            title: "Todas as Atividades",
            activities,
            filter,
            listBaseUrl: ALL_LIST_URL,
            pageSizes: PAGE_SIZES,
            lifeSpheres: lookups.lifeSpheres,
            activityTypeOptions: lookups.activityTypeOptions,
            actionTypes: lookups.actionTypes,
            themeOrganizations: lookups.themeOrganizations,
            activityStatuses: lookups.activityStatuses,
            returnTo: allListUrl(filter, page),
            block: {
                title: "Todas as Atividades",
                icon: "fas fa-database",
                pagination: {
                    page,
                    totalPages,
                    total,
                    firstItem: total === 0 ? 0 : offset + 1,
                    lastItem: offset + activities.length,
                    previousUrl: page > 1 ? allListUrl(filter, page - 1) : null,
                    nextUrl: page < totalPages ? allListUrl(filter, page + 1) : null,
                },
            },
            message: messageFor(req.query.msg),
        });
    },

    //------------------------------------------------
    //                 VIEW ROUTINE (V)
    //------------------------------------------------

    // Página completa: abrir em nova aba ou link direto
    async loadViewPage(req, res) {
        const activity = await loadActivityForView(req.params.id);
        return res.render("cms/cms-Activity-V", {
            title: `Visualizar Atividade nº ${activity.id}`,
            activity,
        });
    },

    // Fragmento HTML (sem layout) para o pop-up de visualização
    async loadViewFragment(req, res) {
        const activity = await loadActivityForView(req.params.id);
        return res.render("cms/cms-Activity-V-fragment", { activity });
    },

    //------------------------------------------------
    //                 INSERT ROUTINE (C)
    //------------------------------------------------

    async loadInsertPage(req, res) {
        const lookups = await loadLookupOptions();
        return res.render("cms/cms-Activity-C", {
            title: "Nova Atividade",
            values: {
                status: String(DEFAULT_ACTIVITY_STATUS_ID),
                activity_type: ACTIVITY_TYPE_PROGRAMMED,
                notify_before_minutes: String(DEFAULT_NOTIFY_BEFORE_MINUTES),
            },
            lifeSpheres: lookups.lifeSpheres,
            lifeSpheresWithColor: lookups.lifeSpheresWithColor,
            activityTypeOptions: lookups.activityTypeOptions,
            dayPeriods: lookups.dayPeriods,
            actionTypes: lookups.actionTypes,
            themeOrganizations: lookups.themeOrganizations,
            activityStatuses: lookups.activityStatuses,
            notifyBeforeOptions: NOTIFY_BEFORE_OPTIONS,
            returnTo: safeListReturn(req.query.returnTo),
            errors: {},
        });
    },

    async insertActivityPage(req, res) {
        const parsed = parseActivityForm(req.body);
        if (!parsed.success) {
            const lookups = await loadLookupOptions();
            return res.status(422).render("cms/cms-Activity-C", {
                title: "Nova Atividade",
                values: req.body ?? {},
                lifeSpheres: lookups.lifeSpheres,
                lifeSpheresWithColor: lookups.lifeSpheresWithColor,
                activityTypeOptions: lookups.activityTypeOptions,
                dayPeriods: lookups.dayPeriods,
                actionTypes: lookups.actionTypes,
                themeOrganizations: lookups.themeOrganizations,
                activityStatuses: lookups.activityStatuses,
                notifyBeforeOptions: NOTIFY_BEFORE_OPTIONS,
                returnTo: safeListReturn(req.body?.returnTo),
                errors: parsed.errors,
            });
        }

        await Activity.insertActivity(parsed.data);
        return res.redirect(303, returnToListUrl(req.body?.returnTo, "created"));
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
                activity_type: activity.activity_type,
                next_activity_date: nextDate,
                final_deadline: finalDate,
                day_period: activity.day_period || "",
                scheduled_time: scheduledTime,
                // Campo numérico do formulário: "1.5" (sem zeros à direita do DECIMAL)
                duration_hours:
                    activity.duration_hours === null || activity.duration_hours === undefined
                        ? ""
                        : String(Number(activity.duration_hours)),
                action_type: activity.action_type || "",
                theme_organization: activity.theme_organization || "",
                notify_before_minutes: String(
                    activity.notify_before_minutes ?? DEFAULT_NOTIFY_BEFORE_MINUTES,
                ),
                notes: activity.notes || "",
                status: String(activity.status),
                ...ruleToFormValues(activity.recurrence_rule),
            },
            lifeSpheres: lookups.lifeSpheres,
            lifeSpheresWithColor: lookups.lifeSpheresWithColor,
            activityTypeOptions: lookups.activityTypeOptions,
            dayPeriods: lookups.dayPeriods,
            actionTypes: lookups.actionTypes,
            themeOrganizations: lookups.themeOrganizations,
            activityStatuses: lookups.activityStatuses,
            notifyBeforeOptions: NOTIFY_BEFORE_OPTIONS,
            returnTo: safeListReturn(req.query.returnTo),
            errors: {},
        });
    },

    async updateActivityPage(req, res) {
        const id = parseId(req.params.id);
        const parsed = parseActivityForm(req.body);
        if (!parsed.success) {
            const lookups = await loadLookupOptions();
            return res.status(422).render("cms/cms-Activity-U", {
                title: `Editar Atividade nº ${id}`,
                activityId: id,
                values: req.body ?? {},
                lifeSpheres: lookups.lifeSpheres,
                lifeSpheresWithColor: lookups.lifeSpheresWithColor,
                activityTypeOptions: lookups.activityTypeOptions,
                dayPeriods: lookups.dayPeriods,
                actionTypes: lookups.actionTypes,
                themeOrganizations: lookups.themeOrganizations,
                activityStatuses: lookups.activityStatuses,
                notifyBeforeOptions: NOTIFY_BEFORE_OPTIONS,
                returnTo: safeListReturn(req.body?.returnTo),
                errors: parsed.errors,
            });
        }

        const affectedRows = await Activity.updateActivity(id, parsed.data);
        if (affectedRows === 0) {
            throw new HttpError(404, "Atividade não encontrada.");
        }
        return res.redirect(303, returnToListUrl(req.body?.returnTo, "updated"));
    },

    //------------------------------------------------
    //            CALENDÁRIO (FullCalendar)
    //------------------------------------------------

    //------------------------------------------------
    //        DASHBOARD (quadrante + gráficos)
    //------------------------------------------------

    async loadDashboardPage(req, res) {
        // Atrasada: data anterior a hoje ou, hoje, início + 5 min já passado
        const { todayStr, overdueTime } = getOverdueReference();
        const [stats, distribution, lookups] = await Promise.all([
            Activity.getActivityStats(todayStr, overdueTime),
            Activity.getActivityDistribution(todayStr, overdueTime),
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

    // Notificação com antecedência (JSON): atividades que começam até o limite da maior
    // antecedência, e as opções de antecedência ("Notificar novamente em" no pop-up).
    // O navegador agenda o pop-up para início - antecedência; sem horário, o início
    // considerado é 00:00 do dia.
    async loadReminders(req, res) {
        const today = new Date();
        const limit = new Date(today);
        limit.setDate(limit.getDate() + NOTIFY_BEFORE_MAX_DAYS + 1);

        const rows = await Activity.selectUpcomingReminders(
            toDateOnlyString(today),
            toDateOnlyString(limit),
        );
        const reminders = rows.map((act) => {
            const date = toDateOnlyString(act.next_activity_date);
            const time = act.scheduled_time ? String(act.scheduled_time).slice(0, 8) : null;
            return {
                id: act.id,
                title: act.description,
                start: `${date}T${time || "00:00:00"}`,
                allDay: !time,
                notifyBeforeMinutes: act.notify_before_minutes ?? DEFAULT_NOTIFY_BEFORE_MINUTES,
                url: `/cms-Activity-V/${act.id}`,
            };
        });
        return res.json({ options: NOTIFY_BEFORE_OPTIONS, reminders });
    },

    // "Notificar novamente em" (pop-up de aviso, JSON): grava a nova antecedência
    // da atividade; o navegador reagenda o aviso para início - nova antecedência.
    async updateReminder(req, res) {
        const id = parseId(req.params.id);
        const parsed = activityNotifyBeforeSchema.safeParse(req.body ?? {});
        if (!parsed.success) {
            return res.status(422).json({ ok: false, errors: toFieldErrors(parsed.error) });
        }

        const minutes = parsed.data.notify_before_minutes;
        const affectedRows = await Activity.updateNotifyBefore(id, minutes);
        if (affectedRows === 0) {
            return res.status(404).json({ ok: false, message: "Atividade não encontrada." });
        }
        return res.json({ ok: true, notifyBeforeMinutes: minutes });
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
        // Só quem pode alterar no Calendário consegue arrastar para remarcar
        const canReschedule = can(req.user, "calendar", "update");

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
            // Sem duração, o FullCalendar usa a duração padrão (1h) na visão semanal
            const endOf = (date) =>
                time ? addDurationToDateTime(date, time, act.duration_hours) : null;
            const { life_sphere_color: color, life_sphere_text_color: textColor } =
                resolveSphereColor(act.life_sphere);
            const extendedProps = {
                activityId: act.id,
                lifeSphere: act.life_sphere,
                activityType: act.activity_type,
                status: statusMap.get(act.status)?.name || null,
                recurrence: act.recurrence_rule ? describeRecurrence(act.recurrence_rule) : null,
            };
            const result = [];

            if (inRange(nextDate)) {
                result.push({
                    id: String(act.id),
                    title: act.description,
                    start: time ? `${nextDate}T${time}` : nextDate,
                    ...(endOf(nextDate) ? { end: endOf(nextDate) } : {}),
                    allDay: !time,
                    url: `/cms-Activity-V/${act.id}`,
                    editable: canReschedule,
                    ...(color ? { backgroundColor: color, borderColor: color, textColor } : {}),
                    extendedProps: { ...extendedProps, kind: "next" },
                });
            }

            // Ocorrências futuras da repetição (depois da próxima atividade): somente leitura
            if (act.recurrence_rule && nextDate) {
                occurrencesBetween(act.recurrence_rule, nextDate, start, end)
                    .filter((date) => date > nextDate)
                    .forEach((date) =>
                        result.push({
                            id: `occurrence-${act.id}-${date}`,
                            title: act.description,
                            start: time ? `${date}T${time}` : date,
                            ...(endOf(date) ? { end: endOf(date) } : {}),
                            allDay: !time,
                            url: `/cms-Activity-V/${act.id}`,
                            editable: false,
                            classNames: ["fc-event-occurrence"],
                            ...(color
                                ? { backgroundColor: color, borderColor: color, textColor }
                                : {}),
                            extendedProps: { ...extendedProps, kind: "occurrence" },
                        }),
                    );
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

        // Data e horário (em branco, a atividade fica sem horário)
        const affectedRows = await Activity.updateNextActivitySchedule(
            id,
            parsed.data.next_activity_date,
            parsed.data.scheduled_time,
        );
        if (affectedRows === 0) {
            throw new HttpError(404, "Atividade não encontrada.");
        }
        return res.redirect(303, returnToListUrl(returnTo, "rescheduled"));
    },

    //------------------------------------------------
    //  CONCLUIR OCORRÊNCIA (atividade recorrente, pop-up da consulta)
    //------------------------------------------------

    async completeOccurrencePage(req, res) {
        const id = parseId(req.params.id);
        const returnTo = req.body?.returnTo;
        const activity = await Activity.selectActivityById(id);
        if (!activity) {
            throw new HttpError(404, "Atividade não encontrada.");
        }
        if (!activity.recurrence_rule) {
            return res.redirect(303, returnToListUrl(returnTo, "notRecurring"));
        }

        const next = nextOccurrence(
            activity.recurrence_rule,
            toDateOnlyString(activity.next_activity_date),
        );
        if (!next) {
            return res.redirect(303, returnToListUrl(returnTo, "seriesEnded"));
        }
        await Activity.updateNextActivityDate(id, next);
        return res.redirect(303, returnToListUrl(returnTo, "occurrenceDone"));
    },

    //------------------------------------------------
    //   SEQUÊNCIA (setas dos blocos OS e Compras)
    //------------------------------------------------

    // Sobe ou desce a atividade uma posição. Pelo script da consulta (JSON) a troca é
    // feita na tela, sem recarregar; sem JavaScript, volta para a consulta.
    async moveActivityPage(req, res) {
        const id = parseId(req.params.id);
        const direction = req.body?.direction;
        const wantsJson = req.accepts(["html", "json"]) === "json";
        if (direction !== "up" && direction !== "down") {
            if (wantsJson) return res.status(422).json({ ok: false, message: "Direção inválida." });
            return res.redirect(303, returnToListUrl(req.body?.returnTo));
        }

        const moved = await Activity.moveActivity(id, direction);
        if (wantsJson) return res.json({ ok: true, moved });
        return res.redirect(303, returnToListUrl(req.body?.returnTo));
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
        return res.redirect(303, returnToListUrl(req.body?.returnTo, "deleted"));
    },
};
