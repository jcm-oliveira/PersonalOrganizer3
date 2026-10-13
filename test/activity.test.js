process.env.NODE_ENV = "test";
process.env.DATABASE_URL = "mysql://app_user:Senha123@localhost:3306/test";

const { describe, it, afterEach, mock } = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
const Activity = require("../src/model/ActivityModel");
const { createApp } = require("../src/app");

const app = createApp();

describe("Módulo Activity (Painel de Vôo)", () => {
    afterEach(() => mock.restoreAll());

    it("lista as atividades ativas da primeira página", async () => {
        mock.method(Activity, "countActivities", async () => 1);
        const select = mock.method(Activity, "selectActivities", async () => [
            {
                id: 1,
                life_sphere: "Profissão e Carreira",
                description: "Reunião de Governança",
                relevance: "Prioridade",
                next_activity_date: "2026-10-10",
                final_deadline: "2026-10-15",
                day_period: "2 - Tarde",
                scheduled_time: "14:00:00",
                periodicity: "Semanal",
                action_type: "Compromisso",
                theme_organization: "[TI] - Escritório TI",
                notes: "Próximas atividades a alinhar",
                status: 1,
            },
        ]);

        const res = await request(app).get("/cms-Activity-Q").expect(200);

        assert.equal(select.mock.callCount(), 1);
        assert.match(res.text, /Atividades/);
        assert.match(res.text, /Reunião de Governança/);
        assert.match(res.text, /Profissão e Carreira/);
        assert.match(res.text, /ATRASADA/); // Data 2026-10-10 é anterior a 2026-10-13
    });

    it("renderiza a tela de dashboard com o quadrante de status das atividades", async () => {
        mock.method(Activity, "getActivityStats", async () => ({
            prazoFinal7Dias: 2,
            vencidas: 9,
            proximos7Dias: 10,
            entre7e15Dias: 5,
            priorizados: 93,
            backlog: 176,
            totalAtivos: 295,
        }));

        const res = await request(app).get("/dashboard").expect(200);

        assert.match(res.text, /Status das Atividades/);
        assert.match(res.text, /Atividades vencidas/);
        assert.match(res.text, /9/);
        assert.match(res.text, /Priorizados/);
        assert.match(res.text, /93/);
    });

    it("renderiza a tela inicial com logotipo e atalhos", async () => {
        const res = await request(app).get("/").expect(200);

        assert.match(res.text, /Personal Organizer 3\.0/);
        assert.match(res.text, /Vida organizada, mente saudável\./);
        assert.match(res.text, /Atividades/);
        assert.match(res.text, /Gestão/);
    });

    it("insere uma atividade válida com campos obrigatórios e complementares (PRG)", async () => {
        const insert = mock.method(Activity, "insertActivity", async () => 10);

        const res = await request(app)
            .post("/cms-Activity-C")
            .type("form")
            .send({
                life_sphere: "Profissão e Carreira",
                description: "PROJETO CCB: Simulador DCR",
                relevance: "Prioridade",
                next_activity_date: "2026-10-20",
                final_deadline: "2026-10-30",
                day_period: "1 - Manhã",
                scheduled_time: "09:30",
                periodicity: "Única",
                action_type: "Tarefa",
                theme_organization: "[TI] - Projetos",
                notes: "Revisar protótipo",
                status: "1",
            })
            .expect(303);

        assert.equal(res.headers.location, "/cms-Activity-Q?msg=created");
        assert.equal(insert.mock.callCount(), 1);
        assert.deepEqual(insert.mock.calls[0].arguments[0], {
            life_sphere: "Profissão e Carreira",
            description: "PROJETO CCB: Simulador DCR",
            relevance: "Prioridade",
            next_activity_date: "2026-10-20",
            final_deadline: "2026-10-30",
            day_period: "1 - Manhã",
            scheduled_time: "09:30:00",
            periodicity: "Única",
            action_type: "Tarefa",
            theme_organization: "[TI] - Projetos",
            notes: "Revisar protótipo",
            status: 1,
        });
    });

    it("rejeita formulário sem campos obrigatórios (descrição / data) e devolve 422", async () => {
        const insert = mock.method(Activity, "insertActivity", async () => 1);

        const res = await request(app)
            .post("/cms-Activity-C")
            .type("form")
            .send({
                life_sphere: "Profissão e Carreira",
                description: "   ",
                next_activity_date: "",
                status: "1",
            })
            .expect(422);

        assert.equal(insert.mock.callCount(), 0);
        assert.match(res.text, /Informe a descrição da atividade\./);
    });

    it("carrega tela de visualização de atividade existente", async () => {
        mock.method(Activity, "selectActivityById", async () => ({
            id: 15,
            life_sphere: "Família, Lazer e Social",
            description: "Backup Celular e PC",
            relevance: "Prioridade",
            next_activity_date: "2026-10-25",
            final_deadline: null,
            day_period: null,
            scheduled_time: null,
            periodicity: null,
            action_type: null,
            theme_organization: null,
            notes: "Verificar HD externo",
            status: 1,
        }));

        const res = await request(app).get("/cms-Activity-V/15").expect(200);

        assert.match(res.text, /Atividade nº 15/);
        assert.match(res.text, /Backup Celular e PC/);
        assert.match(res.text, /Verificar HD externo/);
    });

    it("atualiza uma atividade existente com sucesso", async () => {
        const update = mock.method(Activity, "updateActivity", async () => 1);

        const res = await request(app)
            .post("/cms-Activity-U/15")
            .type("form")
            .send({
                life_sphere: "Família, Lazer e Social",
                description: "Backup Celular e PC atualizado",
                relevance: "Normal",
                next_activity_date: "2026-10-28",
                status: "1",
            })
            .expect(303);

        assert.equal(res.headers.location, "/cms-Activity-Q?msg=updated");
        assert.equal(update.mock.callCount(), 1);
    });

    it("carrega tela de inserção e renderiza o select de Organização por Tema igual aos demais", async () => {
        const res = await request(app).get("/cms-Activity-C").expect(200);

        assert.match(res.text, /<select[^>]*id="theme_organization"/);
        assert.match(res.text, /<option value="">\(Nenhum\)<\/option>/);
    });

    it("exclui uma atividade com exclusão lógica", async () => {
        const del = mock.method(Activity, "deleteActivity", async () => 1);

        const res = await request(app).post("/cms-Activity-D/15").expect(303);

        assert.equal(res.headers.location, "/cms-Activity-Q?msg=deleted");
        assert.equal(del.mock.callCount(), 1);
        assert.equal(del.mock.calls[0].arguments[0], 15);
    });
});
