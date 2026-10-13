const express = require("express");
const ActivityController = require("../controllers/ActivityController");

const routes = express.Router();

routes.get("/cms-Activity-Q", ActivityController.loadShowPage);
routes.get("/cms-Activity-C", ActivityController.loadInsertPage);
routes.post("/cms-Activity-C", ActivityController.insertActivityPage);
routes.get("/cms-Activity-C/:id", ActivityController.loadUpdatePage);
routes.get("/cms-Activity-U/:id", ActivityController.loadUpdatePage);
routes.get("/cms-Activity-V/:id", ActivityController.loadViewPage);
routes.post("/cms-Activity-U/:id", ActivityController.updateActivityPage);
routes.post("/cms-Activity-D/:id", ActivityController.deleteActivityPage);

module.exports = routes;
