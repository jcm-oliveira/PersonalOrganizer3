const express = require("express");
const {
    LifeSphereController,
    RelevanceController,
    DayPeriodController,
    PeriodicityController,
    ActionTypeController,
    ThemeOrganizationController,
    ActivityStatusController,
} = require("../controllers/LookupControllers");

const { requirePermission } = require("../middlewares/auth");
const { LOOKUP_PREFIX_RESOURCE } = require("../security/permissions");

const router = express.Router();

// Cada cadastro usa a tela correspondente nos perfis de acesso (security/permissions.js)
function registerLookupRoutes(prefix, controller) {
    const resource = LOOKUP_PREFIX_RESOURCE[prefix];
    const allow = (action) => requirePermission(resource, action);

    router.get(`/${prefix}-Q`, allow("view"), (req, res, next) =>
        controller.loadShowPage(req, res).catch(next),
    );
    router.get(`/${prefix}-C`, allow("create"), (req, res, next) =>
        controller.loadInsertPage(req, res).catch(next),
    );
    router.post(`/${prefix}-C`, allow("create"), (req, res, next) =>
        controller.insertPage(req, res).catch(next),
    );
    router.get(`/${prefix}-C/:id`, allow("update"), (req, res, next) =>
        controller.loadUpdatePage(req, res).catch(next),
    );
    router.get(`/${prefix}-V/:id`, allow("view"), (req, res, next) =>
        controller.loadViewPage(req, res).catch(next),
    );
    router.post(`/${prefix}-U/:id`, allow("update"), (req, res, next) =>
        controller.updatePage(req, res).catch(next),
    );
    router.post(`/${prefix}-D/:id`, allow("delete"), (req, res, next) =>
        controller.deletePage(req, res).catch(next),
    );
}

// 1. Esfera da Vida
registerLookupRoutes("cms-LifeSphere", LifeSphereController);

// 2. Relevância
registerLookupRoutes("cms-Relevance", RelevanceController);

// 3. Período do Dia
registerLookupRoutes("cms-DayPeriod", DayPeriodController);

// 4. Periodicidade
registerLookupRoutes("cms-Periodicity", PeriodicityController);

// 5. Tipo de Ação
registerLookupRoutes("cms-ActionType", ActionTypeController);

// 6. Organização por tema
registerLookupRoutes("cms-ThemeOrganization", ThemeOrganizationController);

// 7. Status de Atividade
registerLookupRoutes("cms-ActivityStatus", ActivityStatusController);

module.exports = router;
