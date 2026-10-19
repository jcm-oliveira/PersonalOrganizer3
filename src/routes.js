const express = require("express");
const activityRoutes = require("./routes/activityRoutes");
const lookupRoutes = require("./routes/lookupRoutes");
const accessRoutes = require("./routes/accessRoutes");
const { accountRoutes } = require("./routes/authRoutes");
const ActivityController = require("./controllers/ActivityController");
const { requireAuth, requirePermission } = require("./middlewares/auth");

// Rotas que exigem login. As rotas públicas (login, sair, primeiro acesso) ficam em
// routes/authRoutes.js e são registradas antes, em app.js.
const routes = express.Router();

//---------------------------------------------------
//                  PORTAL ROUTES
//---------------------------------------------------

routes.get("/", requireAuth, (req, res) => res.render("index", { title: "Início" }));

routes.get(
    "/dashboard",
    requirePermission("dashboard", "view"),
    ActivityController.loadDashboardPage,
);

//---------------------------------------------------
//                   CMS ROUTES
//---------------------------------------------------

routes.use(accountRoutes);
routes.use(activityRoutes);
routes.use(lookupRoutes);
routes.use(accessRoutes);

module.exports = routes;
