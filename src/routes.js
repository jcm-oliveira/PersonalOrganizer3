const express = require("express");
const exampleRoutes = require("./routes/exampleRoutes");
const activityRoutes = require("./routes/activityRoutes");
const Activity = require("./model/ActivityModel");

const routes = express.Router();

//---------------------------------------------------
//                  PORTAL ROUTES
//---------------------------------------------------

routes.get("/", async (req, res) => {
    const todayStr = new Date().toISOString().slice(0, 10);
    const stats = await Activity.getActivityStats(todayStr);
    return res.render("index", { title: "Início", stats });
});

//---------------------------------------------------
//                   CMS ROUTES
//---------------------------------------------------

routes.use(exampleRoutes);
routes.use(activityRoutes);

module.exports = routes;
