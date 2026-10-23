process.env.NODE_ENV = "test";
process.env.DATABASE_URL = "mysql://app_user:Senha123@localhost:3306/test";

const { describe, it, afterEach, mock } = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
const {
    LifeSphereModel,
    ActivityTypeModel,
    DayPeriodModel,
    PeriodicityModel,
    ActionTypeModel,
    ThemeOrganizationModel,
    ActivityStatusModel,
} = require("../src/model/LookupModels");
const { createApp } = require("../src/app");
const { TEST_ADMIN } = require("./helpers");

const app = createApp({ currentUser: TEST_ADMIN, csrf: false });

describe("Módulo de Cadastros de Apoio", () => {
    afterEach(() => mock.restoreAll());

    it("lista esferas da vida na consulta", async () => {
        mock.method(LifeSphereModel, "count", async () => 1);
        mock.method(LifeSphereModel, "selectList", async () => [
            {
                id: 1,
                name: "Profissão e Carreira",
                description: "Trabalho e carreira",
                color_code: "#007bff",
                status: 1,
            },
        ]);

        const res = await request(app).get("/cms-LifeSphere-Q").expect(200);

        assert.match(res.text, /Esferas da Vida/);
        assert.match(res.text, /Profissão e Carreira/);
        assert.match(res.text, /#007bff/);
    });

    it("insere uma esfera da vida válida com cor hexadecimal (PRG)", async () => {
        const insert = mock.method(LifeSphereModel, "insert", async () => 1);

        const res = await request(app)
            .post("/cms-LifeSphere-C")
            .type("form")
            .send({
                name: "Nova Esfera",
                description: "Descrição de teste",
                color_code: "#28a745",
                status: "1",
            })
            .expect(303);

        assert.equal(insert.mock.callCount(), 1);
        assert.equal(res.headers.location, "/cms-LifeSphere-Q?msg=created");
    });

    it("rejeita esfera da vida com cor inválida", async () => {
        const insert = mock.method(LifeSphereModel, "insert", async () => 1);

        const res = await request(app)
            .post("/cms-LifeSphere-C")
            .type("form")
            .send({
                name: "Esfera Inválida",
                color_code: "azul",
                status: "1",
            })
            .expect(422);

        assert.equal(insert.mock.callCount(), 0);
        assert.match(res.text, /Cor inválida/);
    });

    it("lista tipos de atividade", async () => {
        mock.method(ActivityTypeModel, "count", async () => 1);
        mock.method(ActivityTypeModel, "selectList", async () => [
            { id: 1, name: "Prioridade", description: "Alta urgência", status: 1 },
        ]);

        const res = await request(app).get("/cms-ActivityType-Q").expect(200);

        assert.match(res.text, /Tipos de Atividade/);
        assert.match(res.text, /Prioridade/);
    });

    it("lista períodos do dia", async () => {
        mock.method(DayPeriodModel, "count", async () => 1);
        mock.method(DayPeriodModel, "selectList", async () => [
            { id: 1, name: "1 - Manhã", description: "Turno da manhã", status: 1 },
        ]);

        const res = await request(app).get("/cms-DayPeriod-Q").expect(200);

        assert.match(res.text, /Períodos do Dia/);
        assert.match(res.text, /1 - Manhã/);
    });

    it("lista periodicidades", async () => {
        mock.method(PeriodicityModel, "count", async () => 1);
        mock.method(PeriodicityModel, "selectList", async () => [
            { id: 1, name: "Semanal", description: "Toda semana", status: 1 },
        ]);

        const res = await request(app).get("/cms-Periodicity-Q").expect(200);

        assert.match(res.text, /Periodicidades/);
        assert.match(res.text, /Semanal/);
    });

    it("lista tipos de ação", async () => {
        mock.method(ActionTypeModel, "count", async () => 1);
        mock.method(ActionTypeModel, "selectList", async () => [
            { id: 1, name: "Tarefa", description: "Execução direta", status: 1 },
        ]);

        const res = await request(app).get("/cms-ActionType-Q").expect(200);

        assert.match(res.text, /Tipos de Ação/);
        assert.match(res.text, /Tarefa/);
    });

    it("lista organizações por tema com relacionamento de esfera da vida", async () => {
        mock.method(ThemeOrganizationModel, "count", async () => 1);
        mock.method(ThemeOrganizationModel, "selectList", async () => [
            {
                id: 1,
                name: "[TI] - Escritório de Projetos",
                life_sphere_id: 1,
                life_sphere_name: "Profissão e Carreira",
                life_sphere_color: "#007bff",
                description: "Projetos de tecnologia",
                status: 1,
            },
        ]);
        mock.method(LifeSphereModel, "selectActiveOptionsWithColor", async () => [
            { id: 1, name: "Profissão e Carreira", color_code: "#007bff" },
        ]);

        const res = await request(app).get("/cms-ThemeOrganization-Q").expect(200);

        assert.match(res.text, /Organizações por Tema/);
        assert.match(res.text, /\[TI\] - Escritório de Projetos/);
        assert.match(res.text, /Profissão e Carreira/);
    });

    it("insere organização por tema amarrada com esfera da vida (PRG)", async () => {
        const insert = mock.method(ThemeOrganizationModel, "insert", async () => 10);

        const res = await request(app)
            .post("/cms-ThemeOrganization-C")
            .type("form")
            .send({
                name: "[Financeiro] - Orçamento",
                life_sphere_id: "4",
                description: "Planejamento orçamentário anual",
                status: "1",
            })
            .expect(303);

        assert.equal(insert.mock.callCount(), 1);
        assert.equal(res.headers.location, "/cms-ThemeOrganization-Q?msg=created");
    });

    it("lista status de atividade na consulta com visibilidade e cor de texto", async () => {
        mock.method(ActivityStatusModel, "count", async () => 2);
        mock.method(ActivityStatusModel, "selectList", async () => [
            {
                id: 1,
                name: "Ativo",
                description: "Em andamento",
                visibility: 1,
                color_code: "#28a745",
                status: 1,
            },
            {
                id: 2,
                name: "Concluído",
                description: "Finalizado",
                visibility: 0,
                color_code: "#6c757d",
                status: 1,
            },
        ]);

        const res = await request(app).get("/cms-ActivityStatus-Q").expect(200);

        assert.match(res.text, /Status de Atividade/);
        assert.match(res.text, /Ativo/);
        assert.match(res.text, /Visível padrão/);
        assert.match(res.text, /Oculto padrão/);
        assert.match(res.text, /#28a745/);
    });

    it("insere status de atividade com visibilidade e cor de texto (PRG)", async () => {
        const insert = mock.method(ActivityStatusModel, "insert", async () => 5);

        const res = await request(app)
            .post("/cms-ActivityStatus-C")
            .type("form")
            .send({
                name: "Aguardando Terceiros",
                description: "Dependente de aprovação externa",
                visibility: "0",
                color_code: "#ffc107",
                status: "1",
            })
            .expect(303);

        assert.equal(insert.mock.callCount(), 1);
        assert.equal(res.headers.location, "/cms-ActivityStatus-Q?msg=created");
    });
});
