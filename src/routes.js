const express = require("express");
const activityRoutes = require("./routes/activityRoutes");
const lookupRoutes = require("./routes/lookupRoutes");
const Activity = require("./model/ActivityModel");

const routes = express.Router();

//---------------------------------------------------
//                  PORTAL ROUTES
//---------------------------------------------------

routes.get("/", (req, res) => res.render("index", { title: "Início" }));

routes.get("/dashboard", async (req, res) => {
    const todayStr = new Date().toISOString().slice(0, 10);
    const stats = await Activity.getActivityStats(todayStr);
    return res.render("dashboard", { title: "Dashboard", stats });
});

//---------------------------------------------------
//                   CMS ROUTES
//---------------------------------------------------

routes.use(activityRoutes);
routes.use(lookupRoutes);

module.exports = routes;
