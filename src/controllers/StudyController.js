const path = require("node:path");
const StudyModel = require("../model/StudyModel");
const { HttpError } = require("../errors/HttpError");
const {
    STUDY_FILE_DIR,
    STORED_FILE_PATTERN,
    MAX_FILE_BYTES,
    MAX_FILES_PER_SUBMIT,
    ACCEPTED_EXTENSIONS,
    ACCEPT_ATTRIBUTE,
    removeStudyFile,
    removeUploadedFiles,
} = require("../middlewares/studyUpload");
const {
    PAGE_SIZES,
    STUDY_TYPES,
    MATERIAL_SOURCES,
    listQuerySchema,
    studyFormSchema,
    idParamSchema,
    toFieldErrors,
} = require("../validation/studySchemas");
const { toDateOnlyString, formatDateBr } = require("../validation/activitySchemas");
const { buildPagination, messageFrom } = require("./listHelpers");

const LIST_URL = "/cms-Study-Q";
const DAY_MS = 24 * 60 * 60 * 1000;
const MONTH_LABELS = [
    "Jan",
    "Fev",
    "Mar",
    "Abr",
    "Mai",
    "Jun",
    "Jul",
    "Ago",
    "Set",
    "Out",
    "Nov",
    "Dez",
];

const MESSAGES = {
    created: { alertType: "alert-success", text: "Estudo inserido com sucesso." },
    updated: { alertType: "alert-success", text: "Estudo alterado com sucesso." },
    deleted: { alertType: "alert-warning", text: "Estudo excluído com sucesso." },
};

function parseId(rawId, message = "Estudo não encontrado.") {
    const parsed = idParamSchema.safeParse(rawId);
    if (!parsed.success) throw new HttpError(404, message);
    return parsed.data;
}

//------------------------------------------------
//               APRESENTAÇÃO
//------------------------------------------------

function daysBetween(startStr, endStr) {
    const toUtc = (s) => {
        const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s || "");
        return m ? Date.UTC(m[1], m[2] - 1, m[3]) : null;
    };
    const start = toUtc(startStr);
    const end = toUtc(endStr);
    if (start === null || end === null || end < start) return null;
    return Math.round((end - start) / DAY_MS);
}

/**
 * Duração do estudo: do início ao término ou, se ainda não terminou, até hoje.
 * Ex.: "12 dias" | "≈ 3 meses" | null (sem data de início).
 */
function formatStudyDuration(study, todayStr = toDateOnlyString(new Date())) {
    const days = daysBetween(study.start_date, study.end_date || todayStr);
    if (days === null) return null;
    if (days < 60) return `${days} ${days === 1 ? "dia" : "dias"}`;
    const months = Math.round(days / 30.4);
    return months < 24
        ? `≈ ${months} meses`
        : `≈ ${(days / 365).toFixed(1).replace(".", ",")} anos`;
}

/** 12.5 -> "12,5" | "8.0" -> "8" | null -> null */
function formatHours(hours) {
    if (hours === null || hours === undefined || hours === "") return null;
    const value = Number(hours);
    if (!Number.isFinite(value)) return null;
    return Number.isInteger(value) ? String(value) : value.toFixed(1).replace(".", ",");
}

function formatBytes(bytes) {
    const value = Number(bytes) || 0;
    if (value < 1024) return `${value} B`;
    if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
    return `${(value / 1024 / 1024).toFixed(1).replace(".", ",")} MB`;
}

const isUrl = (text) => /^https?:\/\/\S+$/i.test(String(text || "").trim());

/** Campos prontos para exibição na lista e nos detalhes. */
function present(study, todayStr) {
    return {
        ...study,
        progress: Number(study.progress) || 0,
        isFinished: Number(study.progress) >= 100,
        hasCertificate: Number(study.has_certificate) === 1,
        hoursLabel: formatHours(study.hours),
        startLabel: formatDateBr(study.start_date),
        endLabel: formatDateBr(study.end_date),
        durationLabel: formatStudyDuration(study, todayStr),
        materialIsUrl: isUrl(study.material_source),
        attachments: (study.attachments || []).map((a) => ({
            ...a,
            sizeLabel: formatBytes(a.size_bytes),
            url: `/cms-Study/${study.id}/anexo/${a.id}`,
        })),
    };
}

/** Quadro "Em aberto × Finalizados" (como na planilha), sempre com Leitura e Curso. */
function buildSummaryTable(summary) {
    const byType = new Map((summary || []).map((r) => [r.type, r]));
    const rows = STUDY_TYPES.map((type) => ({
        type,
        open: byType.get(type)?.open ?? 0,
        finished: byType.get(type)?.finished ?? 0,
    }));
    return {
        rows,
        totalOpen: rows.reduce((sum, r) => sum + r.open, 0),
        totalFinished: rows.reduce((sum, r) => sum + r.finished, 0),
    };
}

/** Indicadores de Estudos do Dashboard (dados de StudyModel.getDashboardData). */
function buildStudyDashboard(data, year) {
    const table = buildSummaryTable(data.summary);
    const total = table.totalOpen + table.totalFinished;
    const maxArea = Math.max(1, ...data.byArea.map((a) => a.open + a.finished));
    const monthTotals = new Map(data.finishedByMonth.map((m) => [m.month, m.total]));
    const maxMonth = Math.max(1, ...data.finishedByMonth.map((m) => m.total));
    return {
        year,
        table,
        total,
        completionRate: total === 0 ? 0 : Math.round((table.totalFinished / total) * 100),
        avgOpenProgress: data.avgOpenProgress,
        startedCount: data.startedCount,
        finishedYear: data.finishedYear,
        hoursYearLabel: formatHours(data.hoursYear) || "0",
        hoursTotalLabel: formatHours(data.hoursTotal) || "0",
        certificates: data.certificates,
        inProgress: data.inProgress.map((s) => ({
            ...s,
            progress: Number(s.progress) || 0,
            startLabel: formatDateBr(s.start_date),
        })),
        byArea: data.byArea.map((a) => {
            const areaTotal = a.open + a.finished;
            return {
                ...a,
                total: areaTotal,
                percent: areaTotal === 0 ? 0 : Math.round((a.finished / areaTotal) * 100),
                // Largura da barra relativa à maior área; a parte concluída dentro dela
                width: Math.round((areaTotal / maxArea) * 1000) / 10,
                finishedWidth:
                    areaTotal === 0 ? 0 : Math.round((a.finished / areaTotal) * 1000) / 10,
                href: `${LIST_URL}?${new URLSearchParams({ area: a.label, situation: "all" })}`,
            };
        }),
        byMonth: MONTH_LABELS.map((label, index) => {
            const value = monthTotals.get(index + 1) || 0;
            return { label, total: value, height: Math.round((value / maxMonth) * 100) };
        }),
    };
}

//------------------------------------------------
//                  FORMULÁRIO
//------------------------------------------------

async function renderForm(res, { status = 200, isCreate, values, errors, study = null }) {
    const suggestions = await StudyModel.selectSuggestions();
    return res.status(status).render(isCreate ? "cms/cms-Study-C" : "cms/cms-Study-U", {
        title: isCreate ? "Novo Estudo" : `Editar Estudo nº ${study.id}`,
        isCreate,
        values,
        errors,
        study: study ? present(study) : null,
        studyTypes: STUDY_TYPES,
        materialSources: MATERIAL_SOURCES,
        suggestions,
        upload: {
            accept: ACCEPT_ATTRIBUTE,
            extensions: ACCEPTED_EXTENSIONS.map((e) => e.toUpperCase()).join(", "),
            maxMb: MAX_FILE_BYTES / 1024 / 1024,
            maxFiles: MAX_FILES_PER_SUBMIT,
        },
    });
}

// Valores do formulário a partir do corpo enviado (para exibir de novo após erro)
function valuesFromBody(body) {
    const pick = (key, fallback = "") => (typeof body[key] === "string" ? body[key] : fallback);
    return {
        knowledge_area: pick("knowledge_area"),
        subject: pick("subject"),
        name: pick("name"),
        author: pick("author"),
        study_type: pick("study_type", "Leitura"),
        hours: pick("hours"),
        has_certificate: pick("has_certificate", "0"),
        material_source: pick("material_source"),
        stop_point: pick("stop_point"),
        progress: pick("progress", "0"),
        start_date: pick("start_date"),
        end_date: pick("end_date"),
        notes: pick("notes"),
        remove_attachments: [].concat(body.remove_attachments ?? []).map(String),
    };
}

function valuesFromStudy(study) {
    return {
        knowledge_area: study.knowledge_area,
        subject: study.subject || "",
        name: study.name,
        author: study.author || "",
        study_type: study.study_type,
        hours: formatHours(study.hours) || "",
        has_certificate: String(Number(study.has_certificate) === 1 ? 1 : 0),
        material_source: study.material_source || "",
        stop_point: study.stop_point || "",
        progress: String(study.progress ?? 0),
        start_date: study.start_date || "",
        end_date: study.end_date || "",
        notes: study.notes || "",
        remove_attachments: [],
    };
}

/** Valida o formulário (campos e anexos). Retorna { data } ou { errors }. */
function validateForm(req) {
    const parsed = studyFormSchema.safeParse(req.body ?? {});
    const errors = parsed.success ? {} : toFieldErrors(parsed.error);
    if (req.uploadError) errors.attachments = req.uploadError;
    if (Object.keys(errors).length > 0) {
        // Os arquivos novos não ficam guardados enquanto o formulário tiver erro
        if ((req.files || []).length > 0 && !errors.attachments) {
            errors.attachments = "Corrija os campos indicados e selecione os arquivos novamente.";
        }
        removeUploadedFiles(req.files);
        return { errors };
    }
    const data = { ...parsed.data };
    // Concluído (100%) sem data de término: considera hoje
    if (data.progress >= 100 && !data.end_date) data.end_date = toDateOnlyString(new Date());
    return { data };
}

module.exports = {
    //------------------------------------------------
    //                  CONSULTA (Q)
    //------------------------------------------------

    async loadShowPage(req, res) {
        const query = listQuerySchema.parse(req.query ?? {});
        const filter = {
            situation: query.situation,
            type: query.type,
            search: query.search,
            area: query.area,
        };
        const total = await StudyModel.count(filter);
        const pagination = buildPagination({
            page: query.page,
            perPage: query.perPage,
            total,
            baseUrl: LIST_URL,
            queryParams: { ...filter, perPage: query.perPage },
        });
        const [items, summary, suggestions] = await Promise.all([
            StudyModel.selectList({ ...filter, limit: query.perPage, offset: pagination.offset }),
            StudyModel.getSummary(),
            StudyModel.selectSuggestions(),
        ]);
        const todayStr = toDateOnlyString(new Date());

        return res.render("cms/cms-Study-Q", {
            title: "Estudos",
            items: items.map((s) => present(s, todayStr)),
            summary: buildSummaryTable(summary),
            filter: query,
            studyTypes: STUDY_TYPES,
            knowledgeAreas: suggestions.knowledgeAreas,
            pageSizes: PAGE_SIZES,
            pagination: { ...pagination, lastItem: pagination.offset + items.length },
            message: messageFrom(MESSAGES, req.query.msg),
        });
    },

    //------------------------------------------------
    //               VISUALIZAÇÃO (V)
    //------------------------------------------------

    async loadViewPage(req, res) {
        const id = parseId(req.params.id);
        const study = await StudyModel.selectById(id);
        if (!study) throw new HttpError(404, "Estudo não encontrado.");
        return res.render("cms/cms-Study-V", {
            title: `Estudo nº ${study.id}`,
            study: present(study),
        });
    },

    //------------------------------------------------
    //                  INSERÇÃO (C)
    //------------------------------------------------

    async loadInsertPage(req, res) {
        return renderForm(res, {
            isCreate: true,
            values: {
                study_type: "Leitura",
                progress: "0",
                has_certificate: "0",
                start_date: toDateOnlyString(new Date()),
                remove_attachments: [],
            },
            errors: {},
        });
    },

    async insertPage(req, res) {
        const result = validateForm(req);
        if (result.errors) {
            return renderForm(res, {
                status: 422,
                isCreate: true,
                values: valuesFromBody(req.body ?? {}),
                errors: result.errors,
            });
        }
        try {
            await StudyModel.insert(result.data, req.files || []);
        } catch (error) {
            removeUploadedFiles(req.files);
            throw error;
        }
        return res.redirect(303, `${LIST_URL}?msg=created`);
    },

    //------------------------------------------------
    //                  ALTERAÇÃO (U)
    //------------------------------------------------

    async loadUpdatePage(req, res) {
        const id = parseId(req.params.id);
        const study = await StudyModel.selectById(id);
        if (!study) throw new HttpError(404, "Estudo não encontrado.");
        return renderForm(res, {
            isCreate: false,
            study,
            values: valuesFromStudy(study),
            errors: {},
        });
    },

    async updatePage(req, res) {
        const id = parseId(req.params.id);
        const study = await StudyModel.selectById(id);
        if (!study) {
            removeUploadedFiles(req.files);
            throw new HttpError(404, "Estudo não encontrado.");
        }

        const result = validateForm(req);
        if (result.errors) {
            return renderForm(res, {
                status: 422,
                isCreate: false,
                study,
                values: valuesFromBody(req.body ?? {}),
                errors: result.errors,
            });
        }

        const { remove_attachments: removeIds, ...data } = result.data;
        let outcome;
        try {
            outcome = await StudyModel.update(id, data, req.files || [], removeIds);
        } catch (error) {
            removeUploadedFiles(req.files);
            throw error;
        }
        if (outcome.affectedRows === 0) {
            removeUploadedFiles(req.files);
            throw new HttpError(404, "Estudo não encontrado.");
        }
        // Arquivos dos anexos removidos: apagados só depois da gravação no banco
        outcome.removedFiles.forEach(removeStudyFile);

        return res.redirect(303, `${LIST_URL}?msg=updated`);
    },

    //------------------------------------------------
    //                  EXCLUSÃO (D)
    //------------------------------------------------

    async deletePage(req, res) {
        const id = parseId(req.params.id);
        const affectedRows = await StudyModel.softDelete(id);
        if (affectedRows === 0) throw new HttpError(404, "Estudo não encontrado.");
        return res.redirect(303, `${LIST_URL}?msg=deleted`);
    },

    //------------------------------------------------
    //    ANEXO (download; fora de public/)
    //------------------------------------------------

    async downloadAttachment(req, res) {
        const studyId = parseId(req.params.id, "Anexo não encontrado.");
        const attachmentId = parseId(req.params.attachmentId, "Anexo não encontrado.");
        const attachment = await StudyModel.selectAttachment(studyId, attachmentId);
        if (!attachment || !STORED_FILE_PATTERN.test(attachment.stored_file)) {
            throw new HttpError(404, "Anexo não encontrado.");
        }
        // Sempre como download (nunca exibido no navegador) e sem adivinhar o tipo
        res.attachment(attachment.original_name);
        res.set("Cache-Control", "private, max-age=0, must-revalidate");
        res.set("X-Content-Type-Options", "nosniff");
        return res.sendFile(path.join(STUDY_FILE_DIR, attachment.stored_file), (err) => {
            if (err && !res.headersSent) res.status(404).end();
        });
    },

    // Usados pelo Dashboard (ActivityController.loadDashboardPage)
    buildStudyDashboard,
    formatStudyDuration,
};
