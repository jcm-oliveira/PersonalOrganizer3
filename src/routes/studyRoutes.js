const express = require("express");
const StudyController = require("../controllers/StudyController");
const { requirePermission } = require("../middlewares/auth");
const { verifyCsrfAfterUpload } = require("../middlewares/csrf");
const { uploadStudyFiles, removeUploadedFiles } = require("../middlewares/studyUpload");

const routes = express.Router();

const view = requirePermission("studies", "view");
const create = requirePermission("studies", "create");
const update = requirePermission("studies", "update");
const remove = requirePermission("studies", "delete");

// Formulário multipart: permissão ANTES do upload (quem não pode não grava arquivo);
// CSRF depois do upload (o token vem nos campos do formulário).
function csrfAfterUpload(req, res, next) {
    verifyCsrfAfterUpload(req, res, (err) => {
        if (err) removeUploadedFiles(req.files);
        next(err);
    });
}

routes.get("/cms-Study-Q", view, StudyController.loadShowPage);
routes.get("/cms-Study-C", create, StudyController.loadInsertPage);
routes.post("/cms-Study-C", create, uploadStudyFiles, csrfAfterUpload, StudyController.insertPage);
routes.get("/cms-Study-V/:id", view, StudyController.loadViewPage);
routes.get("/cms-Study-U/:id", update, StudyController.loadUpdatePage);
routes.post(
    "/cms-Study-U/:id",
    update,
    uploadStudyFiles,
    csrfAfterUpload,
    StudyController.updatePage,
);
routes.post("/cms-Study-D/:id", remove, StudyController.deletePage);
// Download dos anexos (somente com permissão de visualizar Estudos)
routes.get("/cms-Study/:id/anexo/:attachmentId", view, StudyController.downloadAttachment);

module.exports = routes;
