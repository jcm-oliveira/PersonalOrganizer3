const express = require("express");
const activityRoutes = require("./routes/activityRoutes");
const lookupRoutes = require("./routes/lookupRoutes");
const ActivityController = require("./controllers/ActivityController");

const routes = express.Router();

//---------------------------------------------------
//                  PORTAL ROUTES
//---------------------------------------------------

routes.get("/", (req, res) => res.render("index", { title: "Início" }));

routes.get("/dashboard", ActivityController.loadDashboardPage);

//---------------------------------------------------
//                   CMS ROUTES
//---------------------------------------------------

routes.use(activityRoutes);
routes.use(lookupRoutes);

module.exports = routes;
