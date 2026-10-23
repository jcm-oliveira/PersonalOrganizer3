// Catálogo de telas (resources) e ações usadas nos perfis de acesso.
// Para proteger uma tela nova, inclua-a aqui e use requirePermission(resource, action)
// nas rotas dela (src/middlewares/auth.js).

const ACTIONS = [
    { key: "view", label: "Visualizar", column: "can_view" },
    { key: "create", label: "Inserir", column: "can_create" },
    { key: "update", label: "Alterar", column: "can_update" },
    { key: "delete", label: "Excluir", column: "can_delete" },
];

const ALL = ["view", "create", "update", "delete"];

const RESOURCES = [
    { key: "dashboard", label: "Dashboard", group: "Gestão", actions: ["view"] },
    {
        key: "activities",
        label: "Atividades",
        group: "Gestão",
        actions: ALL,
        hint: "Alterar inclui remarcar, mudar o status e concluir ocorrência.",
    },
    {
        key: "calendar",
        label: "Calendário",
        group: "Gestão",
        actions: ["view", "update"],
        hint: "Alterar permite remarcar arrastando a atividade.",
    },
    { key: "life_sphere", label: "Esferas da Vida", group: "Cadastros", actions: ALL },
    { key: "activity_type", label: "Tipos de Atividade", group: "Cadastros", actions: ALL },
    { key: "day_period", label: "Períodos do Dia", group: "Cadastros", actions: ALL },
    { key: "action_type", label: "Tipos de Ação", group: "Cadastros", actions: ALL },
    { key: "theme_organization", label: "Organização por Tema", group: "Cadastros", actions: ALL },
    { key: "activity_status", label: "Status de Atividade", group: "Cadastros", actions: ALL },
    { key: "users", label: "Usuários", group: "Acesso", actions: ALL },
    { key: "profiles", label: "Perfis de Acesso", group: "Acesso", actions: ALL },
];

const RESOURCE_BY_KEY = new Map(RESOURCES.map((r) => [r.key, r]));
const ACTION_KEYS = ACTIONS.map((a) => a.key);

// Prefixo das rotas dos cadastros de apoio -> tela usada nas permissões.
// Periodicidade saiu do menu: sem tela no catálogo, só o Administrador acessa.
const LOOKUP_PREFIX_RESOURCE = {
    "cms-LifeSphere": "life_sphere",
    "cms-ActivityType": "activity_type",
    "cms-DayPeriod": "day_period",
    "cms-Periodicity": "periodicity",
    "cms-ActionType": "action_type",
    "cms-ThemeOrganization": "theme_organization",
    "cms-ActivityStatus": "activity_status",
};

/**
 * Junta as permissões de vários perfis (as permissões se somam).
 * rows: [{ resource, can_view, can_create, can_update, can_delete }]
 * Retorna Map<resource, Set<action>>.
 */
function buildPermissionMap(rows) {
    const map = new Map();
    for (const row of rows || []) {
        const resource = RESOURCE_BY_KEY.get(row.resource);
        if (!resource) continue;
        const set = map.get(row.resource) || new Set();
        for (const action of ACTIONS) {
            if (Number(row[action.column]) === 1 && resource.actions.includes(action.key)) {
                set.add(action.key);
            }
        }
        if (set.size > 0) map.set(row.resource, set);
    }
    return map;
}

/** O usuário pode executar a ação na tela? Administrador pode tudo. */
function can(user, resource, action) {
    if (!user) return false;
    if (user.isAdmin) return true;
    return Boolean(user.permissions?.get(resource)?.has(action));
}

/**
 * Normaliza a matriz enviada pelo formulário de perfil: checkboxes "perm" com
 * valores "tela:ação" (ex.: "activities:update"). Qualquer ação implica "Visualizar".
 * Valores desconhecidos são ignorados.
 * Retorna [{ resource, can_view, can_create, can_update, can_delete }] só com
 * telas que tenham alguma permissão.
 */
function permissionsFromForm(perm) {
    const sent = new Set([].concat(perm ?? []).map(String));
    const rows = [];
    for (const resource of RESOURCES) {
        const allowed = new Set(resource.actions.filter((a) => sent.has(`${resource.key}:${a}`)));
        if (allowed.size > 0 && resource.actions.includes("view")) allowed.add("view");
        if (allowed.size === 0) continue;
        rows.push({
            resource: resource.key,
            can_view: allowed.has("view") ? 1 : 0,
            can_create: allowed.has("create") ? 1 : 0,
            can_update: allowed.has("update") ? 1 : 0,
            can_delete: allowed.has("delete") ? 1 : 0,
        });
    }
    return rows;
}

module.exports = {
    ACTIONS,
    ACTION_KEYS,
    RESOURCES,
    RESOURCE_BY_KEY,
    LOOKUP_PREFIX_RESOURCE,
    buildPermissionMap,
    can,
    permissionsFromForm,
};
