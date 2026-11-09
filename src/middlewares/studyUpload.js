// Upload dos anexos dos Estudos (multer). Os arquivos ficam FORA de public/ (pasta
// uploads/studies na raiz do projeto) e só são entregues a usuários com permissão,
// pela rota GET /cms-Study/:id/anexo/:attachmentId, sempre como download.
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const multer = require("multer");

const STUDY_FILE_DIR = path.join(__dirname, "..", "..", "uploads", "studies");
const MAX_FILE_BYTES = 20 * 1024 * 1024;
const MAX_FILES_PER_SUBMIT = 10;

const isZip = (b) => b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04;
const isPdf = (b) => b.toString("ascii", 0, 5) === "%PDF-";
const anyContent = () => true; // texto puro: sem assinatura (entregue só como download)

// Extensão aceita -> tipos MIME que o navegador pode informar + assinatura do conteúdo
const FILE_TYPES = {
    pdf: { mimes: ["application/pdf"], magic: isPdf },
    epub: { mimes: ["application/epub+zip"], magic: isZip },
    doc: { mimes: ["application/msword"], magic: anyContent },
    docx: {
        mimes: ["application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
        magic: isZip,
    },
    xlsx: {
        mimes: ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
        magic: isZip,
    },
    pptx: {
        mimes: ["application/vnd.openxmlformats-officedocument.presentationml.presentation"],
        magic: isZip,
    },
    txt: { mimes: ["text/plain"], magic: anyContent },
    md: { mimes: ["text/markdown", "text/plain", "text/x-markdown"], magic: anyContent },
    jpg: { mimes: ["image/jpeg"], magic: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
    jpeg: { mimes: ["image/jpeg"], magic: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
    png: {
        mimes: ["image/png"],
        magic: (b) =>
            b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
    },
    webp: {
        mimes: ["image/webp"],
        magic: (b) => b.toString("ascii", 0, 4) === "RIFF" && b.toString("ascii", 8, 12) === "WEBP",
    },
};

const ACCEPTED_EXTENSIONS = Object.keys(FILE_TYPES);
// Para o atributo accept="" do campo de arquivo
const ACCEPT_ATTRIBUTE = ACCEPTED_EXTENSIONS.map((ext) => `.${ext}`).join(",");

// Nome gerado pelo sistema (nunca o nome enviado pelo usuário)
const STORED_FILE_PATTERN = new RegExp(`^[a-f0-9]{32}\\.(${ACCEPTED_EXTENSIONS.join("|")})$`);

fs.mkdirSync(STUDY_FILE_DIR, { recursive: true });

function extensionOf(fileName) {
    return path
        .extname(String(fileName || ""))
        .slice(1)
        .toLowerCase();
}

/** Alguns navegadores/sistemas enviam application/octet-stream para .md, .epub etc. */
function isAcceptedFile(file) {
    const type = FILE_TYPES[extensionOf(file.originalname)];
    if (!type) return false;
    return type.mimes.includes(file.mimetype) || file.mimetype === "application/octet-stream";
}

const upload = multer({
    // Nomes com acento (ex.: "Anotações.pdf"): os navegadores enviam em UTF-8
    defParamCharset: "utf8",
    storage: multer.diskStorage({
        destination: STUDY_FILE_DIR,
        filename: (req, file, cb) =>
            cb(null, `${crypto.randomBytes(16).toString("hex")}.${extensionOf(file.originalname)}`),
    }),
    limits: { fileSize: MAX_FILE_BYTES, files: MAX_FILES_PER_SUBMIT, fields: 100 },
    // Tipo não aceito: descarta o arquivo, mas continua lendo os demais campos
    fileFilter: (req, file, cb) => {
        if (isAcceptedFile(file)) return cb(null, true);
        req.uploadError = `Tipo de arquivo não aceito: ${file.originalname}. Use ${ACCEPTED_EXTENSIONS.join(", ").toUpperCase()}.`;
        return cb(null, false);
    },
});

function removeStudyFile(fileName) {
    if (!fileName || !STORED_FILE_PATTERN.test(fileName)) return;
    fs.promises.unlink(path.join(STUDY_FILE_DIR, fileName)).catch(() => {});
}

function removeUploadedFiles(files) {
    (files || []).forEach((file) => removeStudyFile(file.filename));
}

// Confere a assinatura do arquivo (o tipo informado pelo navegador pode ser falso)
async function hasValidSignature(file) {
    const type = FILE_TYPES[extensionOf(file.originalname)];
    if (!type) return false;
    const handle = await fs.promises.open(file.path, "r");
    try {
        const buffer = Buffer.alloc(12);
        await handle.read(buffer, 0, 12, 0);
        return type.magic(buffer);
    } finally {
        await handle.close();
    }
}

/** Nome original seguro para exibição/download (sem caminho nem caracteres de controle). */
function safeOriginalName(name) {
    const base = path
        .basename(String(name || "arquivo").replace(/\\/g, "/"))
        // eslint-disable-next-line no-control-regex
        .replace(/[\u0000-\u001f\u007f"<>|]/g, "")
        .trim();
    return (base || "arquivo").slice(0, 255);
}

/**
 * Lê o formulário multipart do estudo (campos + anexos opcionais "attachments").
 * Erros de upload não interrompem: ficam em req.uploadError para o formulário ser
 * exibido de novo com a mensagem (os arquivos enviados são descartados).
 */
function uploadStudyFiles(req, res, next) {
    upload.array("attachments", MAX_FILES_PER_SUBMIT)(req, res, async (err) => {
        req.body = req.body || {};
        if (err) {
            const byCode = {
                LIMIT_FILE_SIZE: `Cada arquivo deve ter no máximo ${MAX_FILE_BYTES / 1024 / 1024} MB.`,
                LIMIT_FILE_COUNT: `Envie no máximo ${MAX_FILES_PER_SUBMIT} arquivos por vez.`,
                LIMIT_UNEXPECTED_FILE: `Envie no máximo ${MAX_FILES_PER_SUBMIT} arquivos por vez.`,
            };
            req.uploadError = byCode[err.code] || "Não foi possível enviar os arquivos.";
            removeUploadedFiles(req.files);
            req.files = [];
            return next();
        }

        const files = req.files || [];
        const valid = [];
        for (const file of files) {
            if (await hasValidSignature(file).catch(() => false)) {
                valid.push(file);
            } else {
                removeStudyFile(file.filename);
                req.uploadError = `O conteúdo do arquivo ${file.originalname} não corresponde ao tipo informado.`;
            }
        }
        // Algum arquivo recusado: descarta todos (o formulário volta com a mensagem)
        if (req.uploadError) {
            removeUploadedFiles(valid);
            req.files = [];
        } else {
            req.files = valid.map((file) => ({
                ...file,
                originalname: safeOriginalName(file.originalname),
            }));
        }
        return next();
    });
}

module.exports = {
    STUDY_FILE_DIR,
    STORED_FILE_PATTERN,
    MAX_FILE_BYTES,
    MAX_FILES_PER_SUBMIT,
    ACCEPTED_EXTENSIONS,
    ACCEPT_ATTRIBUTE,
    uploadStudyFiles,
    removeStudyFile,
    removeUploadedFiles,
};
