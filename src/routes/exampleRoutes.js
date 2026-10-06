const express = require("express");
const ExampleController = require("../controllers/ExampleController");

const routes = express.Router();

routes.get("/cms-Example-Q", ExampleController.loadShowPage);
routes.get("/cms-Example-C", ExampleController.loadInsertPage);
routes.post("/cms-Example-C", ExampleController.insertExamplePage);
routes.get("/cms-Example-C/:id", ExampleController.loadUpdatePage);
routes.post("/cms-Example-U/:id", ExampleController.updateExamplePage);
routes.post("/cms-Example-D/:id", ExampleController.deleteExamplePage);

module.exports = routes;
