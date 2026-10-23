const express = require("express");
const ActivityController = require("../controllers/ActivityController");
const { requirePermission, requireAnyPermission } = require("../middlewares/auth");

const routes = express.Router();

const view = requirePermission("activities", "view");
const create = requirePermission("activities", "create");
const update = requirePermission("activities", "update");
const remove = requirePermission("activities", "delete");
// Detalhes da atividade: abertos pela consulta e também pelo calendário
const viewDetails = requireAnyPermission([
    ["activities", "view"],
    ["calendar", "view"],
]);

routes.get("/cms-Activity-Q", view, ActivityController.loadShowPage);
routes.get("/cms-Activity-C", create, ActivityController.loadInsertPage);
routes.post("/cms-Activity-C", create, ActivityController.insertActivityPage);
routes.get("/cms-Activity-C/:id", update, ActivityController.loadUpdatePage);
routes.get("/cms-Activity-U/:id", update, ActivityController.loadUpdatePage);
routes.get("/cms-Activity-V/:id", viewDetails, ActivityController.loadViewPage);
routes.get("/cms-Activity-V/:id/detalhes", viewDetails, ActivityController.loadViewFragment);
// Pop-up de notificação com antecedência (todas as páginas)
routes.get("/cms-Activity-N", viewDetails, ActivityController.loadReminders);
// "Notificar novamente em" no pop-up: altera a antecedência da atividade
routes.post("/cms-Activity-N/:id", update, ActivityController.updateReminder);
routes.post("/cms-Activity-U/:id", update, ActivityController.updateActivityPage);
// Remarcar, concluir ocorrência e mudar status são alterações da atividade
routes.post("/cms-Activity-R/:id", update, ActivityController.rescheduleActivityPage);
routes.post("/cms-Activity-O/:id", update, ActivityController.completeOccurrencePage);
routes.post("/cms-Activity-S/:id", update, ActivityController.changeActivityStatusPage);
routes.post("/cms-Activity-D/:id", remove, ActivityController.deleteActivityPage);

routes.get(
    "/cms-Calendar",
    requirePermission("calendar", "view"),
    ActivityController.loadCalendarPage,
);
routes.get(
    "/cms-Calendar/events",
    requirePermission("calendar", "view"),
    ActivityController.loadCalendarEvents,
);
routes.post(
    "/cms-Calendar/events/:id/reschedule",
    requirePermission("calendar", "update"),
    ActivityController.rescheduleCalendarEvent,
);

module.exports = routes;
