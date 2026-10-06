const express = require("express");
const exampleRoutes = require("./routes/exampleRoutes");

const routes = express.Router();

//---------------------------------------------------
//                  PORTAL ROUTES
//---------------------------------------------------

routes.get("/", (req, res) => res.render("index", { title: "Início" }));

//---------------------------------------------------
//                   CMS ROUTES
//---------------------------------------------------

routes.use(exampleRoutes);

module.exports = routes;
