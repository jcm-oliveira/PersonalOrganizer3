// Upload da foto do usuário (multer). As fotos ficam FORA de public/ (pasta
// uploads/users na raiz do projeto) e só são servidas a usuários logados, pela rota
// GET /cms-User/:id/foto.
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const multer = require("multer");

const USER_PHOTO_DIR = path.join(__dirname, "..", "..", "uploads", "users");
const MAX_PHOTO_BYTES = 2 * 1024 * 1024;

const PHOTO_TYPES = {
    "image/jpeg": { ext: "jpg", magic: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
    "image/png": {
        ext: "png",
        magic: (b) =>
            b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
    },
    "image/webp": {
        ext: "webp",
        magic: (b) => b.toString("ascii", 0, 4) === "RIFF" && b.toString("ascii", 8, 12) === "WEBP",
    },
};

// Nome gerado pelo sistema (nunca o nome enviado pelo usuário)
const PHOTO_FILE_PATTERN = /^[a-f0-9]{32}\.(jpg|png|webp)$/;

fs.mkdirSync(USER_PHOTO_DIR, { recursive: true });

const upload = multer({
    storage: multer.diskStorage({
        destination: USER_PHOTO_DIR,
        filename: (req, file, cb) =>
            cb(null, `${crypto.randomBytes(16).toString("hex")}.${PHOTO_TYPES[file.mimetype].ext}`),
    }),
    limits: { fileSize: MAX_PHOTO_BYTES, files: 1, fields: 50 },
    // Tipo não aceito: descarta o arquivo, mas continua lendo os demais campos
    fileFilter: (req, file, cb) => {
        if (PHOTO_TYPES[file.mimetype]) return cb(null, true);
        req.uploadError = "A foto deve ser uma imagem JPG, PNG ou WebP.";
        return cb(null, false);
    },
});

function removePhotoFile(fileName) {
    if (!fileName || !PHOTO_FILE_PATTERN.test(fileName)) return;
    fs.promises.unlink(path.join(USER_PHOTO_DIR, fileName)).catch(() => {});
}

// Confere a assinatura do arquivo (o tipo informado pelo navegador pode ser falso)
async function hasValidSignature(file) {
    const handle = await fs.promises.open(file.path, "r");
    try {
        const buffer = Buffer.alloc(12);
        await handle.read(buffer, 0, 12, 0);
        return PHOTO_TYPES[file.mimetype].magic(buffer);
    } finally {
        await handle.close();
    }
}

/**
 * Lê o formulário multipart do usuário (campos + foto opcional "photo").
 * Erros de upload não interrompem: ficam em req.uploadError para o formulário
 * ser exibido de novo com a mensagem.
 */
function uploadUserPhoto(req, res, next) {
    upload.single("photo")(req, res, async (err) => {
        req.body = req.body || {};
        if (err) {
            req.uploadError =
                err.code === "LIMIT_FILE_SIZE"
                    ? "A foto deve ter no máximo 2 MB."
                    : "Não foi possível enviar a foto.";
            if (req.file) removePhotoFile(req.file.filename);
            req.file = undefined;
            return next();
        }
        if (req.file && !(await hasValidSignature(req.file).catch(() => false))) {
            removePhotoFile(req.file.filename);
            req.file = undefined;
            req.uploadError = "O arquivo enviado não é uma imagem válida.";
        }
        return next();
    });
}

module.exports = {
    USER_PHOTO_DIR,
    PHOTO_FILE_PATTERN,
    uploadUserPhoto,
    removePhotoFile,
};
