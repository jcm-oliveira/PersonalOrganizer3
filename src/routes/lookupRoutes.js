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

const router = express.Router();

function registerLookupRoutes(prefix, controller) {
    router.get(`/${prefix}-Q`, (req, res, next) => controller.loadShowPage(req, res).catch(next));
    router.get(`/${prefix}-C`, (req, res, next) => controller.loadInsertPage(req, res).catch(next));
    router.post(`/${prefix}-C`, (req, res, next) => controller.insertPage(req, res).catch(next));
    router.get(`/${prefix}-C/:id`, (req, res, next) =>
        controller.loadUpdatePage(req, res).catch(next),
    );
    router.get(`/${prefix}-V/:id`, (req, res, next) =>
        controller.loadViewPage(req, res).catch(next),
    );
    router.post(`/${prefix}-U/:id`, (req, res, next) =>
        controller.updatePage(req, res).catch(next),
    );
    router.post(`/${prefix}-D/:id`, (req, res, next) =>
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
