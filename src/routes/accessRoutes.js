const express = require("express");
const UserController = require("../controllers/UserController");
const AccessProfileController = require("../controllers/AccessProfileController");
const { requireAuth, requirePermission } = require("../middlewares/auth");
const { verifyCsrfAfterUpload } = require("../middlewares/csrf");
const { uploadUserPhoto, removePhotoFile } = require("../middlewares/upload");

const routes = express.Router();

// Formulário multipart: permissão ANTES do upload (quem não pode não grava arquivo);
// CSRF depois do upload (o token vem nos campos do formulário).
function csrfAfterUpload(req, res, next) {
    verifyCsrfAfterUpload(req, res, (err) => {
        if (err && req.file) removePhotoFile(req.file.filename);
        next(err);
    });
}

//------------------------------------------------
//                   USUÁRIOS
//------------------------------------------------

routes.get("/cms-User-Q", requirePermission("users", "view"), UserController.loadShowPage);
routes.get("/cms-User-C", requirePermission("users", "create"), UserController.loadInsertPage);
routes.post(
    "/cms-User-C",
    requirePermission("users", "create"),
    uploadUserPhoto,
    csrfAfterUpload,
    UserController.insertPage,
);
routes.get("/cms-User-U/:id", requirePermission("users", "update"), UserController.loadUpdatePage);
routes.post(
    "/cms-User-U/:id",
    requirePermission("users", "update"),
    uploadUserPhoto,
    csrfAfterUpload,
    UserController.updatePage,
);
routes.post("/cms-User-D/:id", requirePermission("users", "delete"), UserController.deletePage);
// Foto: o próprio usuário ou quem pode visualizar usuários (verificado no controller)
routes.get("/cms-User/:id/foto", requireAuth, UserController.photo);

//------------------------------------------------
//               PERFIS DE ACESSO
//------------------------------------------------

routes.get(
    "/cms-AccessProfile-Q",
    requirePermission("profiles", "view"),
    AccessProfileController.loadShowPage,
);
routes.get(
    "/cms-AccessProfile-C",
    requirePermission("profiles", "create"),
    AccessProfileController.loadInsertPage,
);
routes.post(
    "/cms-AccessProfile-C",
    requirePermission("profiles", "create"),
    AccessProfileController.insertPage,
);
routes.get(
    "/cms-AccessProfile-U/:id",
    requirePermission("profiles", "view"),
    AccessProfileController.loadUpdatePage,
);
routes.post(
    "/cms-AccessProfile-U/:id",
    requirePermission("profiles", "update"),
    AccessProfileController.updatePage,
);
routes.post(
    "/cms-AccessProfile-D/:id",
    requirePermission("profiles", "delete"),
    AccessProfileController.deletePage,
);

module.exports = routes;
