// Módulo Estudos (livros e cursos): CRUD, anexos e indicadores do Dashboard.
const { TEST_ADMIN, createAdminApp } = require("./helpers");

const fs = require("node:fs");
const path = require("node:path");
const { describe, it, afterEach, mock } = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
const StudyModel = require("../src/model/StudyModel");
const Activity = require("../src/model/ActivityModel");
const { createApp } = require("../src/app");
const { STUDY_FILE_DIR } = require("../src/middlewares/studyUpload");
const { formatStudyDuration } = require("../src/controllers/StudyController");

const app = createAdminApp();

const PDF = Buffer.from("%PDF-1.4\n1 0 obj << >> endobj\ntrailer << >>\n%%EOF\n");

const existingStudy = {
    id: 7,
    knowledge_area: "Automação, Inteligência Artificial e Ciência de Dados",
    subject: "Ciência de Dados",
    name: "Fundamentos de Inteligência Artificial",
    author: "datascienceacademy",
    study_type: "Curso",
    hours: "40.0",
    has_certificate: 0,
    material_source: "https://www.datascienceacademy.com.br",
    stop_point: "Módulo 5",
    progress: 70,
    start_date: "2026-03-03",
    end_date: null,
    notes: "Linha 1\nLinha 2",
    attachments: [
        {
            id: 3,
            original_name: "resumo.pdf",
            mime_type: "application/pdf",
            size_bytes: 2048,
            created_at: new Date(),
        },
    ],
};

function mockSuggestions() {
    mock.method(StudyModel, "selectSuggestions", async () => ({
        knowledgeAreas: ["Psicologia", "Teologia e Espiritualidade"],
        subjects: ["Psicologia"],
    }));
}

function filesInUploadDir() {
    return fs.readdirSync(STUDY_FILE_DIR).length;
}

function cleanup(fileName) {
    if (fileName) fs.rmSync(path.join(STUDY_FILE_DIR, fileName), { force: true });
}

const validFields = {
    knowledge_area: "Psicologia",
    subject: "Psicologia",
    name: "Teorias da Personalidade",
    author: "Fadiman e Frager",
    study_type: "Leitura",
    hours: "12,5",
    material_source: "Livro físico",
    stop_point: "Cap. 3",
    progress: "35",
    start_date: "2026-01-10",
    end_date: "",
    notes: "Freud, Jung e Adler.",
};

describe("Módulo Estudos", () => {
    afterEach(() => mock.restoreAll());

    it("lista os estudos com quadro Em aberto × Finalizados, evolução e ações", async () => {
        mockSuggestions();
        mock.method(StudyModel, "count", async () => 2);
        mock.method(StudyModel, "getSummary", async () => [
            { type: "Leitura", open: 3, finished: 27 },
            { type: "Curso", open: 2, finished: 78 },
        ]);
        const select = mock.method(StudyModel, "selectList", async () => [
            { ...existingStudy, attachment_count: 1, has_notes: 1 },
            {
                ...existingStudy,
                id: 8,
                name: "O pensamento do antigo oriente",
                study_type: "Leitura",
                material_source: "Livro físico",
                progress: 100,
                end_date: "2026-05-01",
                attachment_count: 0,
                has_notes: 0,
            },
        ]);

        const res = await request(app)
            .get("/cms-Study-Q?situation=open&type=Curso&search=dados")
            .expect(200);
        const text = res.text.replace(/\s+/g, " ");

        assert.deepEqual(
            { ...select.mock.calls[0].arguments[0] },
            { situation: "open", type: "Curso", search: "dados", area: "", limit: 25, offset: 0 },
        );
        // Quadro resumo com totais (5 em aberto, 105 finalizados)
        assert.match(text, /situation=open">3<\/a>/);
        assert.match(text, /type=Curso&amp;situation=finished">78<\/a>/);
        assert.match(text, /situation=open">5<\/a>/);
        assert.match(text, /situation=finished">105<\/a>/);
        // Linha: tipo, evolução, link externo, ações
        assert.match(text, /study-type-badge--course">Curso</);
        assert.match(text, /data-bar-width="70"/);
        assert.match(
            text,
            /href="https:\/\/www.datascienceacademy.com.br" target="_blank" rel="noopener noreferrer"/,
        );
        assert.match(text, /href="\/cms-Study-U\/7"/);
        assert.match(text, /data-delete-action="\/cms-Study-D\/7"/);
        assert.match(text, /fa-paperclip" aria-hidden="true"><\/i>1/);
        // Concluído: linha esmaecida, barra azul e datas
        assert.match(text, /study-row--finished/);
        assert.match(text, /class="study-progress__bar" data-bar-width="100"/);
        assert.match(text, /01\/05\/2026/);
        assert.match(text, /src="\/scripts\/dashboard-charts.js"/);
    });

    it("não cria link para fonte do material que não é http(s)", async () => {
        mockSuggestions();
        mock.method(StudyModel, "count", async () => 1);
        mock.method(StudyModel, "getSummary", async () => []);
        mock.method(StudyModel, "selectList", async () => [
            { ...existingStudy, material_source: "javascript:alert(1)" },
        ]);
        const res = await request(app).get("/cms-Study-Q").expect(200);
        assert.doesNotMatch(res.text, /href="javascript:/);
    });

    it("por padrão lista só os estudos em andamento (< 100%), sem marcar filtro", async () => {
        mockSuggestions();
        mock.method(StudyModel, "count", async () => 0);
        mock.method(StudyModel, "getSummary", async () => []);
        const select = mock.method(StudyModel, "selectList", async () => []);

        const res = await request(app).get("/cms-Study-Q").expect(200);
        assert.equal(select.mock.calls[0].arguments[0].situation, "open");
        assert.doesNotMatch(res.text, /Filtros aplicados/);
        assert.match(res.text, /<option value="open" selected>/);

        // "Todos" continua disponível e conta como filtro aplicado
        await request(app).get("/cms-Study-Q?situation=all").expect(200);
        assert.equal(select.mock.calls[1].arguments[0].situation, "all");
    });

    it("abre o formulário de inserção com anexos, anotações e sugestões", async () => {
        mockSuggestions();
        const res = await request(app).get("/cms-Study-C").expect(200);
        assert.match(res.text, /enctype="multipart\/form-data"/);
        assert.match(res.text, /name="attachments" multiple/);
        assert.match(res.text, /name="notes"/);
        assert.match(res.text, /<option value="Teologia e Espiritualidade">/);
        assert.match(res.text, /value="Leitura" autocomplete="off" checked/);
    });

    it("insere estudo com anexo PDF (nome original com acento) e redireciona (PRG)", async () => {
        const insert = mock.method(StudyModel, "insert", async () => 10);

        let req = request(app).post("/cms-Study-C");
        Object.entries(validFields).forEach(([key, value]) => {
            req = req.field(key, value);
        });
        const res = await req
            .field("has_certificate", "1")
            .attach("attachments", PDF, {
                filename: "Anotações.pdf",
                contentType: "application/pdf",
            })
            .expect(303);

        assert.equal(res.headers.location, "/cms-Study-Q?msg=created");
        const [data, files] = insert.mock.calls[0].arguments;
        try {
            assert.equal(data.knowledge_area, "Psicologia");
            assert.equal(data.study_type, "Leitura");
            assert.equal(data.hours, 12.5);
            assert.equal(data.has_certificate, 1);
            assert.equal(data.progress, 35);
            assert.equal(data.start_date, "2026-01-10");
            assert.equal(data.end_date, null);
            assert.equal(data.notes, "Freud, Jung e Adler.");
            assert.equal(files.length, 1);
            assert.equal(files[0].originalname, "Anotações.pdf");
            assert.match(files[0].filename, /^[a-f0-9]{32}\.pdf$/);
            assert.ok(fs.existsSync(path.join(STUDY_FILE_DIR, files[0].filename)));
        } finally {
            cleanup(files[0]?.filename);
        }
    });

    it("estudo com 100% sem data de término considera hoje como término", async () => {
        const insert = mock.method(StudyModel, "insert", async () => 11);
        await request(app)
            .post("/cms-Study-C")
            .type("form")
            .send({ ...validFields, progress: "100" })
            .expect(303);
        const [data] = insert.mock.calls[0].arguments;
        assert.match(data.end_date, /^\d{4}-\d{2}-\d{2}$/);
    });

    it("recusa formulário inválido (422) e descarta o arquivo enviado", async () => {
        mockSuggestions();
        const insert = mock.method(StudyModel, "insert", async () => 10);
        const before = filesInUploadDir();

        const res = await request(app)
            .post("/cms-Study-C")
            .field("knowledge_area", "")
            .field("name", "")
            .field("study_type", "Podcast")
            .field("progress", "150")
            .field("start_date", "2026-05-10")
            .field("end_date", "2026-05-01")
            .attach("attachments", PDF, { filename: "a.pdf", contentType: "application/pdf" })
            .expect(422);

        assert.equal(insert.mock.callCount(), 0);
        assert.match(res.text, /Informe a área de conhecimento\./);
        assert.match(res.text, /Informe o nome do livro ou curso\./);
        assert.match(res.text, /Selecione o tipo \(Leitura ou Curso\)\./);
        assert.match(res.text, /A evolução deve estar entre 0 e 100%\./);
        assert.match(res.text, /selecione os arquivos novamente/);
        assert.equal(filesInUploadDir(), before);
    });

    it("recusa data de término anterior à de início", async () => {
        mockSuggestions();
        const insert = mock.method(StudyModel, "insert", async () => 10);
        const res = await request(app)
            .post("/cms-Study-C")
            .type("form")
            .send({ ...validFields, start_date: "2026-05-10", end_date: "2026-05-01" })
            .expect(422);
        assert.equal(insert.mock.callCount(), 0);
        assert.match(res.text, /A data de término não pode ser anterior à data de início\./);
        // Os valores digitados voltam preenchidos
        assert.match(res.text, /value="Teorias da Personalidade"/);
    });

    it("recusa arquivo de tipo não aceito ou com conteúdo falso", async () => {
        mockSuggestions();
        const insert = mock.method(StudyModel, "insert", async () => 10);
        const before = filesInUploadDir();

        const exe = await request(app)
            .post("/cms-Study-C")
            .field("knowledge_area", "Psicologia")
            .field("name", "Livro")
            .field("study_type", "Leitura")
            .field("progress", "0")
            .attach("attachments", Buffer.from("MZ"), {
                filename: "virus.exe",
                contentType: "application/octet-stream",
            })
            .expect(422);
        assert.match(exe.text, /Tipo de arquivo não aceito: virus.exe/);

        const fake = await request(app)
            .post("/cms-Study-C")
            .field("knowledge_area", "Psicologia")
            .field("name", "Livro")
            .field("study_type", "Leitura")
            .field("progress", "0")
            .attach("attachments", Buffer.from("<html>não é pdf</html>"), {
                filename: "falso.pdf",
                contentType: "application/pdf",
            })
            .expect(422);
        assert.match(fake.text, /não corresponde ao tipo informado/);

        assert.equal(insert.mock.callCount(), 0);
        assert.equal(filesInUploadDir(), before);
    });

    it("abre a edição com anexos existentes e opção de remover", async () => {
        mockSuggestions();
        mock.method(StudyModel, "selectById", async () => existingStudy);
        const res = await request(app).get("/cms-Study-U/7").expect(200);
        assert.match(res.text, /action="\/cms-Study-U\/7"/);
        assert.match(res.text, /href="\/cms-Study\/7\/anexo\/3"/);
        assert.match(res.text, /name="remove_attachments"\s+value="3"/);
        assert.match(res.text, /value="40"/); // horas "40.0" -> "40"
        assert.match(res.text, /Linha 1\nLinha 2<\/textarea>/);
    });

    it("altera o estudo, remove anexos marcados e apaga os arquivos depois da gravação", async () => {
        mock.method(StudyModel, "selectById", async () => existingStudy);
        const storedName = "0123456789abcdef0123456789abcdef.pdf";
        fs.writeFileSync(path.join(STUDY_FILE_DIR, storedName), PDF);
        const update = mock.method(StudyModel, "update", async () => ({
            affectedRows: 1,
            removedFiles: [storedName],
        }));

        const res = await request(app)
            .post("/cms-Study-U/7")
            .type("form")
            .send(
                "knowledge_area=Psicologia&name=Livro&study_type=Curso&progress=80" +
                    "&remove_attachments=3&remove_attachments=abc",
            )
            .expect(303);

        assert.equal(res.headers.location, "/cms-Study-Q?msg=updated");
        const [id, data, files, removeIds] = update.mock.calls[0].arguments;
        assert.equal(id, 7);
        assert.equal(data.progress, 80);
        assert.equal(data.remove_attachments, undefined);
        assert.deepEqual(files, []);
        assert.deepEqual(removeIds, [3]);
        // Remoção do arquivo é assíncrona
        await new Promise((resolve) => setTimeout(resolve, 50));
        assert.equal(fs.existsSync(path.join(STUDY_FILE_DIR, storedName)), false);
    });

    it("visualiza o estudo com anotações, detalhes e anexos", async () => {
        mock.method(StudyModel, "selectById", async () => existingStudy);
        const res = await request(app).get("/cms-Study-V/7").expect(200);
        assert.match(res.text, /Fundamentos de Inteligência Artificial/);
        assert.match(res.text, /class="study-notes-view">Linha 1\nLinha 2<\/div>/);
        assert.match(res.text, /03\/03\/2026/);
        assert.match(res.text, /resumo.pdf/);
        assert.match(res.text, /2 KB/);
    });

    it("exclui (lógico) e responde 404 para estudo inexistente", async () => {
        const del = mock.method(StudyModel, "softDelete", async (id) => (id === 7 ? 1 : 0));
        const res = await request(app).post("/cms-Study-D/7").expect(303);
        assert.equal(res.headers.location, "/cms-Study-Q?msg=deleted");
        assert.equal(del.mock.calls[0].arguments[0], 7);
        await request(app).post("/cms-Study-D/99").expect(404);
        await request(app).get("/cms-Study-V/abc").expect(404);
    });

    it("baixa o anexo sempre como download (nome original preservado)", async () => {
        const storedName = "fedcba9876543210fedcba9876543210.pdf";
        fs.writeFileSync(path.join(STUDY_FILE_DIR, storedName), PDF);
        mock.method(StudyModel, "selectAttachment", async (studyId, attachmentId) =>
            studyId === 7 && attachmentId === 3
                ? {
                      id: 3,
                      original_name: "Resumo do curso.pdf",
                      stored_file: storedName,
                      mime_type: "application/pdf",
                      size_bytes: PDF.length,
                  }
                : null,
        );
        try {
            const res = await request(app).get("/cms-Study/7/anexo/3").expect(200);
            assert.match(
                res.headers["content-disposition"],
                /^attachment; filename="Resumo do curso.pdf"/,
            );
            assert.equal(res.headers["x-content-type-options"], "nosniff");
            await request(app).get("/cms-Study/7/anexo/4").expect(404);
        } finally {
            cleanup(storedName);
        }
    });

    it("calcula a duração do estudo", () => {
        assert.equal(formatStudyDuration({ start_date: null, end_date: null }), null);
        assert.equal(
            formatStudyDuration({ start_date: "2026-01-01", end_date: "2026-01-02" }),
            "1 dia",
        );
        assert.equal(
            formatStudyDuration({ start_date: "2026-01-01", end_date: null }, "2026-01-31"),
            "30 dias",
        );
        assert.equal(
            formatStudyDuration({ start_date: "2026-01-01", end_date: "2026-07-01" }),
            "≈ 6 meses",
        );
    });

    it("mostra no Dashboard os indicadores de evolução e conclusão dos estudos", async () => {
        mock.method(Activity, "getActivityStats", async () => ({}));
        mock.method(Activity, "getActivityDistribution", async () => ({
            bySphere: [],
            byActionType: [],
            byActivityType: [],
            byStatus: [],
            bySchedule: [],
        }));
        const dashboard = mock.method(StudyModel, "getDashboardData", async () => ({
            summary: [
                { type: "Leitura", open: 3, finished: 27 },
                { type: "Curso", open: 2, finished: 78 },
            ],
            avgOpenProgress: 16,
            startedCount: 3,
            finishedYear: 4,
            hoursYear: 32.5,
            hoursTotal: 410,
            certificates: 20,
            inProgress: [
                {
                    id: 7,
                    name: "Fundamentos de Inteligência Artificial",
                    study_type: "Curso",
                    knowledge_area: "Ciência de Dados",
                    progress: 70,
                    stop_point: "Módulo 5",
                    start_date: null,
                },
            ],
            byArea: [
                { label: "Psicologia", open: 2, finished: 2 },
                { label: "Teologia", open: 0, finished: 1 },
            ],
            finishedByMonth: [{ month: 3, total: 2 }],
        }));

        const res = await request(app).get("/dashboard").expect(200);
        const text = res.text.replace(/\s+/g, " ");

        assert.equal(dashboard.mock.calls[0].arguments[0].year, new Date().getFullYear());
        assert.match(text, /Estudos: evolução e conclusão/);
        // Taxa de conclusão: 105 de 110
        assert.match(text, /Taxa de conclusão<\/span> <span class="study-kpi__value">95%/);
        assert.match(
            text,
            /Evolução média \(em aberto\)<\/span> <span class="study-kpi__value">16%/,
        );
        assert.match(text, /32,5/);
        assert.match(text, /href="\/cms-Study-V\/7"/);
        assert.match(text, /data-bar-width="70"/);
        // Por área: largura relativa à maior área e parte concluída
        assert.match(text, /Psicologia: 2 de 4 finalizados \(50%\)/);
        assert.match(
            text,
            /data-bar-width="25"> <span class="study-area-bar__done" data-bar-width="100"/,
        );
        assert.match(text, /href="\/cms-Study-Q\?area=Psicologia&amp;situation=all"/);
        // Concluídos por mês: março = maior coluna
        assert.match(text, /title="Mar: 2 concluídos"[^]*?data-bar-height="100"/);
    });

    it("sem permissão em Estudos: sem menu, sem indicadores e acesso negado", async () => {
        const user = {
            ...TEST_ADMIN,
            isAdmin: false,
            permissions: new Map([["dashboard", new Set(["view"])]]),
        };
        const limitedApp = createApp({ currentUser: user, csrf: false });
        mock.method(Activity, "getActivityStats", async () => ({}));
        mock.method(Activity, "getActivityDistribution", async () => ({
            bySphere: [],
            byActionType: [],
            byActivityType: [],
            byStatus: [],
            bySchedule: [],
        }));
        const dashboard = mock.method(StudyModel, "getDashboardData", async () => {
            throw new Error("não deveria consultar");
        });

        const res = await request(limitedApp).get("/dashboard").expect(200);
        assert.equal(dashboard.mock.callCount(), 0);
        assert.doesNotMatch(res.text, /Estudos: evolução e conclusão/);
        assert.doesNotMatch(res.text, /href="\/cms-Study-Q">Estudos/);

        await request(limitedApp).get("/cms-Study-Q").expect(403);
        await request(limitedApp).get("/cms-Study/7/anexo/3").expect(403);
        // Sem permissão de inserir: o arquivo nem chega a ser gravado
        const before = filesInUploadDir();
        await request(limitedApp)
            .post("/cms-Study-C")
            .attach("attachments", PDF, { filename: "a.pdf", contentType: "application/pdf" })
            .expect(403);
        assert.equal(filesInUploadDir(), before);
    });
});
