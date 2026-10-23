process.env.NODE_ENV = "test";
process.env.DATABASE_URL = "mysql://app_user:Senha123@localhost:3306/test";

const { describe, it, afterEach, mock } = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
const Activity = require("../src/model/ActivityModel");
const Lookups = require("../src/model/LookupModels");
const { createApp } = require("../src/app");
const { TEST_ADMIN } = require("./helpers");

const app = createApp({ currentUser: TEST_ADMIN, csrf: false });

describe("Módulo Activity (Painel de Vôo)", () => {
    afterEach(() => mock.restoreAll());

    it("lista as atividades ativas da primeira página", async () => {
        mock.method(Activity, "countActivities", async () => 1);
        const select = mock.method(Activity, "selectActivities", async () => [
            {
                id: 1,
                life_sphere: "Profissão e Carreira",
                description: "Reunião de Governança",
                activity_type: "Prioridade",
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
        // Padrão de 50 itens por página, já marcado no filtro
        assert.equal(select.mock.calls[0].arguments[0].limit, 50);
        assert.match(res.text, /<option value="50" selected>50<\/option>/);
        assert.match(res.text, /Atividades/);
        assert.match(res.text, /Reunião de Governança/);
        assert.match(res.text, /Profissão e Carreira/);
        // Mesmo atrasada, a linha mantém a cor da Esfera da Vida
        assert.match(
            res.text,
            /<tr class="activity-row--sphere"\s+data-bg-color="#007bff" data-text-color="#212529">/,
        );
        assert.doesNotMatch(res.text, /table-danger/);
        assert.match(
            res.text,
            /class="badge activity-status-badge" style="background-color: #28a745; color: #212529;"/,
        );
        assert.match(res.text, /href="\/cms-Activity-U\/1"/);
        // Datas exibidas em dd/mm/aaaa (o atributo do botão Remarcar continua em ISO)
        assert.match(res.text, />\s*10\/10\/2026 <span class="activity-datetime__sep"/); // horário ao lado
        assert.match(res.text, />\s*15\/10\/2026\s*</);
        assert.match(res.text, /data-next-date="2026-10-10"/);
        assert.doesNotMatch(res.text, /table-bordered/);
        // Cartão no celular: resumo com data, prazo, esfera, relevância e status
        const summary = res.text.match(/<td class="c-mobile-summary">([\s\S]*?)<\/td>/)[1];
        assert.match(summary, /10\/10\/2026 · 14:00/);
        assert.match(summary, /Prazo 15\/10\/2026/);
        assert.match(summary, /Profissão e Carreira · Prioridade · /);
        assert.match(res.text, />\s*ATRASADO\s*</); // Data 2026-10-10 é anterior a 2026-10-13
        // Colunas: "Farol" primeiro, sem colunas "Faltam (dias)" e sem a linha de agrupamento
        const labels = [...res.text.matchAll(/activity-th-label">([^<]+)/g)].map((m) =>
            m[1].trim(),
        );
        assert.deepEqual(labels, [
            "Farol",
            "Descrição",
            "Tipo de Ação",
            "Próxima Atividade",
            "Prazo Final",
            "Repetição",
            "Organização por tema",
            "Status",
            "Ações",
        ]);
        assert.doesNotMatch(res.text, /INFORMAÇÕES OBRIGATÓRIAS|table-activity-group|Dia Próx\./);
        const cells = [...res.text.matchAll(/<td class="(c-[a-z-]+)/g)].map((m) => m[1]);
        assert.deepEqual(cells.slice(0, 6), [
            "c-dayprox",
            "c-desc",
            "c-mobile-summary",
            "c-action",
            "c-next",
            "c-deadline",
        ]);
        // Descrição com a Esfera da Vida abaixo, discreta (sem coluna própria)
        const descCell = res.text.match(/<td class="c-desc[^"]*">([\s\S]*?)<\/td>/)[1];
        assert.match(
            descCell,
            /Reunião de Governança[\s\S]*<span class="activity-subtext" title="Esfera da Vida">[\s\S]*Profissão e Carreira<\/span>/,
        );
        assert.doesNotMatch(descCell, /Compromisso|Prioridade/);
        // Tipo de ação com o tipo de atividade abaixo, discreto
        const actionCell = res.text.match(/<td class="c-action[^"]*">([\s\S]*?)<\/td>/)[1];
        assert.match(
            actionCell,
            /Compromisso\s*<span class="activity-subtext" title="Tipo de Atividade">[\s\S]*Prioridade<\/span>/,
        );
        // Próxima atividade: data e horário juntos, período do dia discreto (sem o prefixo
        // "2 - ") e, abaixo, os dias sem parênteses (as duas datas já passaram)
        const nextCell = res.text.match(/<td class="c-next[^"]*">([\s\S]*?)<\/td>/)[1];
        assert.match(
            nextCell,
            /<span class="activity-datetime">10\/10\/2026 <span class="activity-datetime__sep" aria-hidden="true">\|<\/span> 14:00<\/span>/,
        );
        assert.match(
            nextCell,
            /<span class="activity-period" title="Período do dia">[\s\S]*\(Tarde\)<\/span>/,
        );
        assert.match(nextCell, /<span class="activity-subtext">há \d+ dias?<\/span>/);
        const deadlineCell = res.text.match(/<td class="c-deadline[^"]*">([\s\S]*?)<\/td>/)[1];
        assert.match(
            deadlineCell,
            /15\/10\/2026\s*<span class="activity-subtext">há \d+ dias?<\/span>/,
        );
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

        mock.method(Activity, "getActivityDistribution", async () => ({
            bySphere: [],
            byActionType: [],
            byActivityType: [],
            byStatus: [],
            bySchedule: [],
        }));

        const res = await request(app).get("/dashboard").expect(200);

        assert.match(res.text, /Status das Atividades/);
        assert.match(res.text, /Atividades vencidas/);
        assert.match(res.text, /9/);
        assert.match(res.text, /Priorizados/);
        assert.match(res.text, /93/);
        assert.match(res.text, /Balanceamento das atividades/);
        assert.match(res.text, /Nenhuma atividade para exibir\./);
    });

    it("renderiza os gráficos de balanceamento no dashboard", async () => {
        mockLookupsWithStatuses();
        mock.method(Lookups.LifeSphereModel, "selectActiveOptionsWithColor", async () => [
            { id: 1, name: "Profissão e Carreira", color_code: "#007bff" },
            { id: 2, name: "Saúde e Esporte", color_code: "#28a745" },
            { id: 3, name: "Bens e Finanças", color_code: "#fd7e14" },
        ]);
        mock.method(Lookups.LifeSphereModel, "selectAllWithColor", async () => [
            { id: 1, name: "Profissão e Carreira", color_code: "#007bff" },
            { id: 2, name: "Saúde e Esporte", color_code: "#28a745" },
            { id: 3, name: "Bens e Finanças", color_code: "#fd7e14" },
        ]);
        mock.method(Lookups.ActionTypeModel, "selectActiveOptions", async () => [
            { id: 1, name: "Compromisso" },
            { id: 2, name: "Tarefa" },
        ]);
        mock.method(Activity, "getActivityStats", async () => ({
            prazoFinal7Dias: 0,
            vencidas: 0,
            proximos7Dias: 0,
            entre7e15Dias: 0,
            priorizados: 0,
            backlog: 0,
            totalAtivos: 4,
        }));
        const distribution = mock.method(Activity, "getActivityDistribution", async () => ({
            bySphere: [
                { label: "Profissão e Carreira", total: 3 },
                { label: "Saúde e Esporte", total: 1 },
            ],
            byActionType: [
                { label: "Compromisso", total: 2 },
                { label: "Não informado", total: 2 },
            ],
            byActivityType: [{ label: "Prioridade", total: 4 }],
            byStatus: [
                { statusId: 1, total: 4 },
                { statusId: 4, total: 1 },
            ],
            bySchedule: [
                { bucket: "ATRASADO", total: 1 },
                { bucket: "MAIS_15", total: 3 },
            ],
        }));

        const res = await request(app).get("/dashboard").expect(200);
        const text = res.text.replace(/\s+/g, " ");

        assert.match(distribution.mock.calls[0].arguments[0], /^\d{4}-\d{2}-\d{2}$/);
        // Esfera da Vida: cor do cadastro, % do total e largura relativa à maior barra
        assert.match(
            text,
            /title="Profissão e Carreira: 3 atividades \(75%\)"[^]*?data-bar-width="100" data-bg-color="#007bff"/,
        );
        assert.match(
            text,
            /title="Saúde e Esporte: 1 atividade \(25%\)"[^]*?data-bar-width="33.3" data-bg-color="#28a745"/,
        );
        // Esfera sem atividades aparece com zero (é parte do balanceamento)
        assert.match(text, /title="Bens e Finanças: 0 atividades \(0%\)"/);
        assert.match(
            text,
            /href="\/cms-Activity-Q\?status=visible&amp;lifeSphere=Bens\+e\+Finan%C3%A7as"/,
        );
        // Status: todas as atividades, com cor do cadastro e link para o filtro
        assert.match(text, /title="Pendente: 4 atividades \(80%\)"[^]*?data-bg-color="#28a745"/);
        assert.match(text, /href="\/cms-Activity-Q\?status=4"/);
        // Tipo de Ação: "Não informado" sem link
        assert.match(text, /<span class="hbar-label"> Não informado <\/span>/);
        assert.match(text, /title="Tarefa: 0 atividades \(0%\)"/);
        // Próxima atividade: ordem fixa (Atrasado primeiro)
        assert.match(text, /title="Atrasado: 1 atividade \(25%\)"[^]*?title="Hoje: 0 atividades/);
        assert.match(text, /src="\/scripts\/dashboard-charts.js"/);
    });

    it("renderiza a tela inicial com logotipo e atalhos", async () => {
        const res = await request(app).get("/").expect(200);

        assert.match(res.text, /Personal Organizer 3\.0/);
        assert.match(res.text, /Vida organizada, mente saudável\./);
        assert.match(res.text, /Atividades/);
        assert.match(res.text, /Gestão/);
        assert.match(
            res.text,
            /<a class="card dashboard-shortcut h-100" href="\/cms-Calendar">[\s\S]*?Calendário/,
        );
        // Periodicidade foi substituída pela Repetição: fora do menu e da tela inicial
        assert.doesNotMatch(res.text, /cms-Periodicity-Q/);
    });

    it("insere uma atividade válida com campos obrigatórios e complementares (PRG)", async () => {
        const insert = mock.method(Activity, "insertActivity", async () => 10);

        const res = await request(app)
            .post("/cms-Activity-C")
            .type("form")
            .send({
                life_sphere: "Profissão e Carreira",
                description: "PROJETO CCB: Simulador DCR",
                activity_type: "Prioridade",
                next_activity_date: "2026-10-20",
                final_deadline: "2026-10-30",
                day_period: "1 - Manhã",
                scheduled_time: "09:30",
                duration_hours: "1,5",
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
            activity_type: "Prioridade",
            next_activity_date: "2026-10-20",
            final_deadline: "2026-10-30",
            day_period: "1 - Manhã",
            scheduled_time: "09:30:00",
            duration_hours: 1.5,
            recurrence_rule: null,
            action_type: "Tarefa",
            theme_organization: "[TI] - Projetos",
            notify_before_minutes: 15, // padrão quando não informado
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

    it("cadastra atividade sem data da próxima atividade", async () => {
        const insert = mock.method(Activity, "insertActivity", async () => 1);

        await request(app)
            .post("/cms-Activity-C")
            .type("form")
            .send({
                life_sphere: "Profissão e Carreira",
                description: "Atividade sem data",
                next_activity_date: "",
                status: "1",
            })
            .expect(303);

        assert.equal(insert.mock.callCount(), 1);
        assert.equal(insert.mock.calls[0].arguments[0].next_activity_date, null);
        assert.equal(insert.mock.calls[0].arguments[0].recurrence_rule, null);
    });

    it("exige a data da próxima atividade quando há repetição", async () => {
        const insert = mock.method(Activity, "insertActivity", async () => 1);

        const res = await request(app)
            .post("/cms-Activity-C")
            .type("form")
            .send({
                life_sphere: "Profissão e Carreira",
                description: "Atividade recorrente sem data",
                next_activity_date: "",
                recurrence_freq: "DAILY",
                recurrence_interval: "1",
                status: "1",
            })
            .expect(422);

        assert.equal(insert.mock.callCount(), 0);
        assert.match(res.text, /Informe a data da próxima atividade para usar a repetição\./);
    });

    it("carrega tela de visualização de atividade existente", async () => {
        mock.method(Activity, "selectActivityById", async () => ({
            id: 15,
            life_sphere: "Família, Lazer e Social",
            description: "Backup Celular e PC",
            activity_type: "Prioridade",
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
                activity_type: "Normal",
                next_activity_date: "2026-10-28",
                status: "1",
            })
            .expect(303);

        assert.equal(res.headers.location, "/cms-Activity-Q?msg=updated");
        assert.equal(update.mock.callCount(), 1);
    });

    it("carrega tela de edição com a cor da esfera e indicador visual", async () => {
        mock.method(Activity, "selectActivityById", async () => ({
            id: 15,
            life_sphere: "Profissão e Carreira",
            description: "Backup Celular e PC",
            activity_type: "Prioridade",
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

        const res = await request(app).get("/cms-Activity-U/15").expect(200);

        assert.match(res.text, /Editar Atividade nº 15/);
        assert.match(res.text, /id="life_sphere_badge"/);
        assert.match(res.text, /data-color="#007bff"/);
    });

    it("pinta a linha com a cor da esfera, inclusive de esfera inativa", async () => {
        mock.method(Lookups.LifeSphereModel, "selectActiveOptionsWithColor", async () => [
            { id: 1, name: "Profissão e Carreira", color_code: "#007bff" },
        ]);
        mock.method(Lookups.LifeSphereModel, "selectAllWithColor", async () => [
            { id: 1, name: "Profissão e Carreira", color_code: "#007bff" },
            { id: 2, name: "Esfera Antiga", color_code: "#6f42c1" },
        ]);
        for (const model of [
            "ActivityTypeModel",
            "DayPeriodModel",
            "PeriodicityModel",
            "ActionTypeModel",
            "ThemeOrganizationModel",
        ]) {
            mock.method(Lookups[model], "selectActiveOptions", async () => []);
        }
        mock.method(Lookups.ActivityStatusModel, "selectActiveOptionsWithStyle", async () => [
            { id: 1, name: "Ativo", visibility: 1, color_code: "#28a745" },
        ]);
        mock.method(Activity, "countActivities", async () => 1);
        mock.method(Activity, "selectActivities", async () => [
            {
                id: 7,
                life_sphere: "esfera antiga ",
                description: "Atividade de esfera inativa",
                activity_type: "Normal",
                next_activity_date: "2099-01-01",
                final_deadline: null,
                status: 1,
            },
        ]);

        const res = await request(app).get("/cms-Activity-Q").expect(200);

        assert.match(
            res.text,
            /<tr class="activity-row--sphere"\s+data-bg-color="#6f42c1" data-text-color="#ffffff">/,
        );
    });

    it("considera a data de hoje como HOJE (0 dias), sem deslocamento de fuso horário", () => {
        const {
            calculateDaysDiff,
            toDateOnlyString,
            enrichActivity,
        } = require("../src/validation/activitySchemas");
        for (const hour of [0, 10, 22, 23]) {
            const ref = new Date(2026, 9, 13, hour, 30); // 13/10/2026 em horário local
            assert.equal(calculateDaysDiff("2026-10-13", ref), 0);
            assert.equal(calculateDaysDiff("2026-10-14", ref), 1);
            assert.equal(calculateDaysDiff("2026-10-12", ref), -1);
            assert.equal(calculateDaysDiff(new Date(2026, 9, 13), ref), 0); // Date vindo do MySQL
            assert.equal(toDateOnlyString(ref), "2026-10-13");
            assert.equal(
                enrichActivity({ next_activity_date: "2026-10-13" }, ref).next_activity_day_label,
                "HOJE",
            );
        }
    });

    it("farol: atividade de hoje com horário fica ATRASADO 5 min após o início", () => {
        const {
            enrichActivity,
            getOverdueReference,
        } = require("../src/validation/activitySchemas");
        const act = { next_activity_date: "2026-10-13", scheduled_time: "09:00:00" };
        const at = (h, m) => enrichActivity(act, new Date(2026, 9, 13, h, m));

        // Antes do limite: HOJE, com o momento em que passa a atrasada
        assert.equal(at(9, 4).next_activity_day_label, "HOJE");
        assert.equal(at(9, 4).traffic_light, "HOJE");
        assert.equal(at(9, 4).overdue_at, "2026-10-13T09:05:00");
        // Início + 5 min: ATRASADO
        assert.equal(at(9, 5).next_activity_day_label, "ATRASADO");
        assert.equal(at(9, 5).traffic_light, "ATRASADA");
        assert.equal(at(9, 5).overdue_at, null);
        // Sem horário: continua HOJE durante o dia
        const allDay = enrichActivity(
            { next_activity_date: "2026-10-13" },
            new Date(2026, 9, 13, 23, 0),
        );
        assert.equal(allDay.next_activity_day_label, "HOJE");
        assert.equal(allDay.overdue_at, null);

        // Referência usada nas consultas (filtro e dashboard)
        assert.deepEqual(getOverdueReference(new Date(2026, 9, 13, 9, 5, 30)), {
            todayStr: "2026-10-13",
            overdueTime: "09:00:30",
        });
        // Logo após a meia-noite nenhuma atividade de hoje está atrasada pelo horário
        assert.equal(getOverdueReference(new Date(2026, 9, 13, 0, 3)).overdueTime, null);
    });

    it("filtro Atrasadas recebe a referência de horário do farol", async () => {
        mock.method(Activity, "countActivities", async () => 0);
        const select = mock.method(Activity, "selectActivities", async () => []);

        await request(app).get("/cms-Activity-Q").query({ trafficLight: "ATRASADA" }).expect(200);

        const criteria = select.mock.calls[0].arguments[0];
        assert.equal(criteria.trafficLight, "ATRASADA");
        assert.match(criteria.todayStr, /^\d{4}-\d{2}-\d{2}$/);
        assert.ok(
            criteria.overdueTime === null || /^\d{2}:\d{2}:\d{2}$/.test(criteria.overdueTime),
        );
    });

    it("calcula o rótulo do Dia Próx. conforme a regra da planilha", () => {
        const { getNextActivityDayLabel } = require("../src/validation/activitySchemas");
        const ref = new Date(2026, 9, 13); // terça-feira, 13/10/2026
        assert.equal(getNextActivityDayLabel(-3, ref), "ATRASADO");
        assert.equal(getNextActivityDayLabel(0, ref), "HOJE");
        assert.equal(getNextActivityDayLabel(1, ref), "AMANHÃ");
        assert.equal(getNextActivityDayLabel(2, ref), "QUINTA");
        assert.equal(getNextActivityDayLabel(5, ref), "DOMINGO");
        assert.equal(getNextActivityDayLabel(6, ref), "SEGUNDA");
        assert.equal(getNextActivityDayLabel(15, ref), "QUARTA");
        assert.equal(getNextActivityDayLabel(16, ref), "MAIS DE 15 DIAS");
        assert.equal(getNextActivityDayLabel(null, ref), "-");
    });

    it("calcula a cor de texto com contraste adequado sobre a cor da esfera", () => {
        const { getContrastTextColor } = require("../src/validation/activitySchemas");
        assert.equal(getContrastTextColor("#ffc107"), "#212529");
        assert.equal(getContrastTextColor("#6f42c1"), "#ffffff");
        assert.equal(getContrastTextColor("#000"), "#ffffff");
        assert.equal(getContrastTextColor("invalida"), null);
        assert.equal(getContrastTextColor(null), null);
    });

    it("carrega tela de inserção e renderiza o select de Organização por Tema igual aos demais", async () => {
        const res = await request(app).get("/cms-Activity-C").expect(200);

        assert.match(res.text, /<select[^>]*id="theme_organization"/);
        assert.match(res.text, /<option value="">\(Nenhum\)<\/option>/);
    });

    it("carrega tela de inserção com a data da próxima atividade em branco", async () => {
        const res = await request(app).get("/cms-Activity-C").expect(200);

        assert.match(res.text, /id="next_activity_date" name="next_activity_date" value=""/);
    });

    function mockLookupsWithStatuses() {
        mock.method(Lookups.LifeSphereModel, "selectActiveOptionsWithColor", async () => []);
        mock.method(Lookups.LifeSphereModel, "selectAllWithColor", async () => []);
        for (const model of [
            "ActivityTypeModel",
            "DayPeriodModel",
            "PeriodicityModel",
            "ActionTypeModel",
            "ThemeOrganizationModel",
        ]) {
            mock.method(Lookups[model], "selectActiveOptions", async () => []);
        }
        mock.method(Lookups.ActivityStatusModel, "selectActiveOptionsWithStyle", async () => [
            { id: 4, name: "Cancelado", visibility: 0, color_code: "#6c757d" },
            { id: 2, name: "Em andamento", visibility: 1, color_code: "#007bff" },
            { id: 1, name: "Pendente", visibility: 1, color_code: "#28a745" },
        ]);
    }

    it("filtro de status lista os status do cadastro e usa os visíveis como padrão", async () => {
        mockLookupsWithStatuses();
        mock.method(Activity, "countActivities", async () => 0);
        const select = mock.method(Activity, "selectActivities", async () => []);

        const res = await request(app).get("/cms-Activity-Q").expect(200);

        assert.equal(select.mock.calls[0].arguments[0].status, "visible");
        assert.match(res.text, /<option value="visible" selected>Visíveis por padrão<\/option>/);
        assert.match(res.text, /<option value="4" >\s*Cancelado\s*<\/option>/);
        assert.match(res.text, /<option value="2" >\s*Em andamento\s*<\/option>/);
        assert.match(res.text, /<option value="1" >\s*Pendente\s*<\/option>/);
        assert.doesNotMatch(res.text, /Ativas \(Padrão\)|Inativas \/ Ocultas/);
        assert.doesNotMatch(res.text, /Filtros aplicados/);
    });

    it("filtra por um status específico do cadastro", async () => {
        mockLookupsWithStatuses();
        mock.method(Activity, "countActivities", async () => 0);
        const select = mock.method(Activity, "selectActivities", async () => []);

        const res = await request(app).get("/cms-Activity-Q?status=2").expect(200);

        assert.equal(select.mock.calls[0].arguments[0].status, 2);
        assert.match(res.text, /<option value="2" selected>\s*Em andamento\s*<\/option>/);
        assert.match(res.text, /Filtros aplicados/);
    });

    it("nova atividade vem com o registro 1 do cadastro de status como padrão", async () => {
        mockLookupsWithStatuses();

        const res = await request(app).get("/cms-Activity-C").expect(200);

        assert.match(res.text, /<option value="1" selected>\s*Pendente\s*<\/option>/);
        assert.doesNotMatch(res.text, /<option value="[234]" selected>/);
    });

    it("exibe os botões Remarcar atividade e Status da atividade com seus pop-ups", async () => {
        mockLookupsWithStatuses();
        mock.method(Activity, "countActivities", async () => 1);
        mock.method(Activity, "selectActivities", async () => [
            {
                id: 5,
                life_sphere: "Profissão e Carreira",
                description: "Revisar contrato",
                activity_type: "Normal",
                next_activity_date: "2026-10-20",
                final_deadline: null,
                status: 2,
            },
        ]);

        const res = await request(app).get("/cms-Activity-Q?status=all").expect(200);

        assert.match(res.text, /data-target="#rescheduleModal"[\s\S]*?data-activity-id="5"/);
        assert.match(res.text, /data-next-date="2026-10-20"/);
        assert.match(res.text, /title="Remarcar atividade"/);
        assert.match(res.text, /data-target="#statusModal"[\s\S]*?data-status="2"/);
        assert.match(res.text, /title="Status da atividade"/);
        assert.match(res.text, /id="rescheduleModal"/);
        assert.match(res.text, /id="statusModal"/);
        assert.match(res.text, /name="returnTo" value="\/cms-Activity-Q\?status=all&amp;/);
        assert.match(res.text, /src="\/scripts\/activity-quick-actions.js"/);
    });

    it("remarca a atividade e volta para a consulta mantendo os filtros", async () => {
        const update = mock.method(Activity, "updateNextActivityDate", async () => 1);

        const res = await request(app)
            .post("/cms-Activity-R/5")
            .type("form")
            .send({
                next_activity_date: "2026-11-02",
                returnTo: "/cms-Activity-Q?status=all&page=2",
            })
            .expect(303);

        assert.deepEqual(update.mock.calls[0].arguments, [5, "2026-11-02"]);
        assert.equal(res.headers.location, "/cms-Activity-Q?status=all&page=2&msg=rescheduled");
    });

    it("não remarca com data inválida", async () => {
        const update = mock.method(Activity, "updateNextActivityDate", async () => 1);

        const res = await request(app)
            .post("/cms-Activity-R/5")
            .type("form")
            .send({ next_activity_date: "02/11/2026" })
            .expect(303);

        assert.equal(update.mock.callCount(), 0);
        assert.equal(res.headers.location, "/cms-Activity-Q?msg=invalidDate");
    });

    it("ignora destino de retorno externo (redirecionamento aberto)", async () => {
        mock.method(Activity, "updateNextActivityDate", async () => 1);

        for (const returnTo of ["https://exemplo.com/cms-Activity-Q", "//exemplo.com", "/outra"]) {
            const res = await request(app)
                .post("/cms-Activity-R/5")
                .type("form")
                .send({ next_activity_date: "2026-11-02", returnTo })
                .expect(303);
            assert.equal(res.headers.location, "/cms-Activity-Q?msg=rescheduled");
        }
    });

    it("altera o status da atividade para um status do cadastro", async () => {
        mockLookupsWithStatuses();
        const update = mock.method(Activity, "updateActivityStatus", async () => 1);

        const res = await request(app)
            .post("/cms-Activity-S/5")
            .type("form")
            .send({ status: "4", returnTo: "/cms-Activity-Q" })
            .expect(303);

        assert.deepEqual(update.mock.calls[0].arguments, [5, 4]);
        assert.equal(res.headers.location, "/cms-Activity-Q?msg=statusChanged");
    });

    it("não altera o status para um status inexistente no cadastro", async () => {
        mockLookupsWithStatuses();
        const update = mock.method(Activity, "updateActivityStatus", async () => 1);

        const res = await request(app)
            .post("/cms-Activity-S/5")
            .type("form")
            .send({ status: "99" })
            .expect(303);

        assert.equal(update.mock.callCount(), 0);
        assert.equal(res.headers.location, "/cms-Activity-Q?msg=invalidStatus");
    });

    it("retorna 404 ao remarcar atividade inexistente", async () => {
        mock.method(Activity, "updateNextActivityDate", async () => 0);
        await request(app)
            .post("/cms-Activity-R/999")
            .type("form")
            .send({ next_activity_date: "2026-11-02" })
            .expect(404);
    });

    it("renderiza a aba Calendário com o FullCalendar e o menu", async () => {
        mockLookupsWithStatuses();

        const res = await request(app).get("/cms-Calendar").expect(200);

        assert.match(res.text, /<a class="nav-link" href="\/cms-Calendar">Calendário<\/a>/);
        assert.match(res.text, /id="activityCalendar"\s+data-events-url="\/cms-Calendar\/events"/);
        assert.match(res.text, /fullcalendar@5\.11\.5\/main\.min\.js"\s+integrity="sha384-/);
        assert.match(res.text, /src="\/scripts\/activity-calendar.js"/);
    });

    it("no calendário, o término do evento é o horário de início + a duração", async () => {
        mockLookupsWithStatuses();
        mock.method(Activity, "selectActivitiesForCalendar", async () => [
            {
                id: 7,
                life_sphere: "Profissão e Carreira",
                description: "Reunião de 1h30",
                activity_type: "Prioridade",
                next_activity_date: "2026-10-20",
                scheduled_time: "09:00:00",
                duration_hours: "1.50", // MySQL devolve DECIMAL como texto
                status: 1,
            },
            {
                id: 8,
                life_sphere: "Profissão e Carreira",
                description: "Plantão noturno",
                activity_type: "Normal",
                next_activity_date: "2026-10-21",
                scheduled_time: "23:30:00",
                duration_hours: "2.00",
                status: 1,
            },
            {
                id: 9,
                life_sphere: "Profissão e Carreira",
                description: "Dia inteiro com duração",
                activity_type: "Normal",
                next_activity_date: "2026-10-22",
                scheduled_time: null,
                duration_hours: "3.00",
                status: 1,
            },
        ]);

        const res = await request(app)
            .get("/cms-Calendar/events")
            .query({ start: "2026-10-18", end: "2026-10-25" })
            .expect(200);

        const byId = Object.fromEntries(res.body.map((e) => [e.id, e]));
        assert.equal(byId["7"].start, "2026-10-20T09:00:00");
        assert.equal(byId["7"].end, "2026-10-20T10:30:00");
        // Passa da meia-noite: termina no dia seguinte
        assert.equal(byId["8"].end, "2026-10-22T01:30:00");
        // Sem horário: evento de dia inteiro, a duração não se aplica
        assert.equal(byId["9"].allDay, true);
        assert.equal("end" in byId["9"], false);
    });

    it("valida a duração em horas no formulário de atividade", async () => {
        const insert = mock.method(Activity, "insertActivity", async () => 1);
        const send = (duration_hours) =>
            request(app).post("/cms-Activity-C").type("form").send({
                life_sphere: "Profissão e Carreira",
                description: "Com duração",
                duration_hours,
                status: "1",
            });

        for (const invalid of ["0", "25", "1,3", "abc", "-1"]) {
            const res = await send(invalid).expect(422);
            assert.match(res.text, /id="duration_hours"/);
        }
        assert.equal(insert.mock.callCount(), 0);

        await send("0,75").expect(303);
        await send("").expect(303);
        assert.equal(insert.mock.calls[0].arguments[0].duration_hours, 0.75);
        assert.equal(insert.mock.calls[1].arguments[0].duration_hours, null);
    });

    it("formulário traz a notificação com antecedência com 15 minutos como padrão", async () => {
        const res = await request(app).get("/cms-Activity-C").expect(200);

        const select = res.text.match(
            /<select[^>]*id="notify_before_minutes"[\s\S]*?<\/select>/,
        )[0];
        const options = [...select.matchAll(/<option value="(\d+)"/g)].map((m) => Number(m[1]));
        assert.deepEqual(
            options,
            [0, 15, 30, 60, 120, 180, 240, 300, 1440, 2880, 4320, 5760, 7200],
        );
        assert.match(select, /<option value="15" selected>\s*15 minutos \(padrão\)/);
    });

    it("grava a antecedência escolhida e recusa valores fora da lista", async () => {
        const insert = mock.method(Activity, "insertActivity", async () => 1);
        const send = (notify_before_minutes) =>
            request(app).post("/cms-Activity-C").type("form").send({
                life_sphere: "Profissão e Carreira",
                description: "Com notificação",
                notify_before_minutes,
                status: "1",
            });

        const res = await send("45").expect(422);
        assert.match(res.text, /Selecione uma antecedência válida para a notificação\./);
        assert.equal(insert.mock.callCount(), 0);

        await send("1440").expect(303);
        assert.equal(insert.mock.calls[0].arguments[0].notify_before_minutes, 1440);
    });

    it("retorna os avisos das próximas atividades com início e antecedência", async () => {
        const select = mock.method(Activity, "selectUpcomingReminders", async () => [
            {
                id: 5,
                description: "Reunião <equipe>",
                next_activity_date: "2026-10-24",
                scheduled_time: "09:30:00",
                notify_before_minutes: 60,
            },
            {
                id: 6,
                description: "Dia inteiro",
                next_activity_date: new Date(2026, 9, 25),
                scheduled_time: null,
                notify_before_minutes: 1440,
            },
        ]);

        const res = await request(app)
            .get("/cms-Activity-N")
            .expect(200)
            .expect("Content-Type", /json/);

        // Busca de hoje até o limite da maior antecedência (5 dias) + 1
        const [from, to] = select.mock.calls[0].arguments;
        assert.equal((Date.parse(to) - Date.parse(from)) / 86400000, 6);
        // Opções de antecedência para o "Notificar novamente em" do pop-up
        assert.deepEqual(res.body.options[0], { minutes: 0, label: "Na hora da atividade" });
        assert.deepEqual(res.body.options[1], { minutes: 15, label: "15 minutos" });
        assert.equal(res.body.options.length, 13);
        assert.deepEqual(res.body.reminders, [
            {
                id: 5,
                title: "Reunião <equipe>",
                start: "2026-10-24T09:30:00",
                allDay: false,
                notifyBeforeMinutes: 60,
                url: "/cms-Activity-V/5",
            },
            {
                id: 6,
                title: "Dia inteiro",
                start: "2026-10-25T00:00:00",
                allDay: true,
                notifyBeforeMinutes: 1440,
                url: "/cms-Activity-V/6",
            },
        ]);
    });

    it("inclui o script de avisos nas páginas para quem vê atividades", async () => {
        mock.method(Activity, "countActivities", async () => 0);
        mock.method(Activity, "selectActivities", async () => []);
        const res = await request(app).get("/cms-Activity-Q").expect(200);
        assert.match(
            res.text,
            /src="\/scripts\/activity-reminders\.js" data-url="\/cms-Activity-N"\s+data-can-update="true"/,
        );
    });

    it('"Notificar novamente em" grava a nova antecedência da atividade', async () => {
        const update = mock.method(Activity, "updateNotifyBefore", async () => 1);

        const res = await request(app)
            .post("/cms-Activity-N/5")
            .send({ notify_before_minutes: 30 })
            .expect(200)
            .expect("Content-Type", /json/);

        assert.deepEqual(res.body, { ok: true, notifyBeforeMinutes: 30 });
        assert.deepEqual(update.mock.calls[0].arguments, [5, 30]);

        // "Na hora da atividade" (0 minutos antes)
        await request(app).post("/cms-Activity-N/5").send({ notify_before_minutes: 0 }).expect(200);
        assert.deepEqual(update.mock.calls[1].arguments, [5, 0]);
    });

    it('"Notificar novamente em" recusa antecedência fora da lista e atividade inexistente', async () => {
        const update = mock.method(Activity, "updateNotifyBefore", async () => 0);

        const invalid = await request(app)
            .post("/cms-Activity-N/5")
            .send({ notify_before_minutes: 45 })
            .expect(422);
        assert.equal(invalid.body.ok, false);
        assert.equal(update.mock.callCount(), 0);

        await request(app)
            .post("/cms-Activity-N/999")
            .send({ notify_before_minutes: 15 })
            .expect(404);
    });

    it("mostra o horário de término e a duração na visualização da atividade", async () => {
        mock.method(Activity, "selectActivityById", async () => ({
            id: 7,
            life_sphere: "Profissão e Carreira",
            description: "Reunião de 1h30",
            activity_type: "Prioridade",
            next_activity_date: "2026-10-20",
            final_deadline: null,
            day_period: null,
            scheduled_time: "09:00:00",
            duration_hours: "1.50",
            notify_before_minutes: 60,
            action_type: null,
            theme_organization: null,
            notes: null,
            status: 1,
            recurrence_rule: null,
        }));

        const res = await request(app).get("/cms-Activity-V/7/detalhes").expect(200);

        assert.match(res.text, /09:00 às 10:30/);
        assert.match(res.text, /1 hora antes/);
        assert.match(res.text, /· 1h30/);
    });

    it("retorna as atividades como eventos do calendário com a cor da esfera", async () => {
        mockLookupsWithStatuses();
        mock.method(Lookups.LifeSphereModel, "selectAllWithColor", async () => [
            { id: 1, name: "Profissão e Carreira", color_code: "#6f42c1" },
        ]);
        const select = mock.method(Activity, "selectActivitiesForCalendar", async () => [
            {
                id: 3,
                life_sphere: "Profissão e Carreira",
                description: "Reunião",
                activity_type: "Prioridade",
                next_activity_date: new Date(2026, 9, 20),
                scheduled_time: "14:30:00",
                status: 2,
            },
            {
                id: 4,
                life_sphere: "Sem cadastro",
                description: "Dia inteiro",
                activity_type: "Normal",
                next_activity_date: "2026-10-21",
                final_deadline: "2026-11-05",
                scheduled_time: null,
                status: 1,
            },
            {
                id: 6,
                life_sphere: "Profissão e Carreira",
                description: "Só o prazo no período",
                activity_type: "Normal",
                next_activity_date: "2026-12-01",
                final_deadline: new Date(2026, 9, 30),
                scheduled_time: null,
                status: 1,
            },
        ]);

        const res = await request(app)
            .get("/cms-Calendar/events")
            .query({ start: "2026-09-27T00:00:00-03:00", end: "2026-11-08T00:00:00-03:00" })
            .expect(200)
            .expect("Content-Type", /json/);

        assert.deepEqual(select.mock.calls[0].arguments[0], {
            start: "2026-09-27",
            end: "2026-11-08",
            status: "visible",
        });
        assert.deepEqual(res.body, [
            {
                id: "3",
                title: "Reunião",
                start: "2026-10-20T14:30:00",
                allDay: false,
                url: "/cms-Activity-V/3",
                editable: true,
                backgroundColor: "#6f42c1",
                borderColor: "#6f42c1",
                textColor: "#ffffff",
                extendedProps: {
                    activityId: 3,
                    lifeSphere: "Profissão e Carreira",
                    activityType: "Prioridade",
                    status: "Em andamento",
                    kind: "next",
                    recurrence: null,
                },
            },
            {
                id: "4",
                title: "Dia inteiro",
                start: "2026-10-21",
                allDay: true,
                url: "/cms-Activity-V/4",
                editable: true,
                extendedProps: {
                    activityId: 4,
                    lifeSphere: "Sem cadastro",
                    activityType: "Normal",
                    status: "Pendente",
                    kind: "next",
                    recurrence: null,
                },
            },
            {
                id: "deadline-4",
                title: "Prazo final: Dia inteiro",
                start: "2026-11-05",
                allDay: true,
                url: "/cms-Activity-V/4",
                editable: false,
                classNames: ["fc-event-deadline"],
                extendedProps: {
                    activityId: 4,
                    lifeSphere: "Sem cadastro",
                    activityType: "Normal",
                    status: "Pendente",
                    kind: "deadline",
                    recurrence: null,
                },
            },
            {
                id: "deadline-6",
                title: "Prazo final: Só o prazo no período",
                start: "2026-10-30",
                allDay: true,
                url: "/cms-Activity-V/6",
                editable: false,
                classNames: ["fc-event-deadline"],
                borderColor: "#6f42c1",
                extendedProps: {
                    activityId: 6,
                    lifeSphere: "Profissão e Carreira",
                    activityType: "Normal",
                    status: "Pendente",
                    kind: "deadline",
                    recurrence: null,
                },
            },
        ]);
    });

    it("filtra o calendário pelo status escolhido", async () => {
        mockLookupsWithStatuses();
        const select = mock.method(Activity, "selectActivitiesForCalendar", async () => []);
        const range = { start: "2026-10-01", end: "2026-11-01" };

        await request(app)
            .get("/cms-Calendar/events")
            .query({ ...range, status: "4" })
            .expect(200);
        await request(app)
            .get("/cms-Calendar/events")
            .query({ ...range, status: "all" })
            .expect(200);
        await request(app)
            .get("/cms-Calendar/events")
            .query({ ...range, status: "x" })
            .expect(200);

        assert.equal(select.mock.calls[0].arguments[0].status, 4);
        assert.equal(select.mock.calls[1].arguments[0].status, null);
        assert.equal(select.mock.calls[2].arguments[0].status, "visible");
    });

    it("renderiza o filtro de status e a legenda de prazo final no calendário", async () => {
        mockLookupsWithStatuses();

        const res = await request(app).get("/cms-Calendar").expect(200);

        assert.match(res.text, /id="calendarStatusFilter"/);
        assert.match(res.text, /<option value="visible" selected>Visíveis por padrão<\/option>/);
        assert.match(res.text, /<option value="4">Cancelado<\/option>/);
        assert.match(res.text, /Prazo final/);
        assert.match(res.text, /data-reschedule-url-prefix="\/cms-Calendar\/events\/"/);
    });

    it("remarca pelo calendário (arrastar) mantendo o horário quando não informado", async () => {
        const updateDate = mock.method(Activity, "updateNextActivityDate", async () => 1);
        const updateSchedule = mock.method(Activity, "updateNextActivitySchedule", async () => 1);

        await request(app)
            .post("/cms-Calendar/events/5/reschedule")
            .send({ next_activity_date: "2026-10-22" })
            .expect(200, { ok: true });
        await request(app)
            .post("/cms-Calendar/events/5/reschedule")
            .send({ next_activity_date: "2026-10-23", scheduled_time: "09:30" })
            .expect(200, { ok: true });

        assert.deepEqual(updateDate.mock.calls[0].arguments, [5, "2026-10-22"]);
        assert.deepEqual(updateSchedule.mock.calls[0].arguments, [5, "2026-10-23", "09:30"]);
    });

    it("recusa remarcação inválida pelo calendário", async () => {
        const updateDate = mock.method(Activity, "updateNextActivityDate", async () => 0);

        await request(app)
            .post("/cms-Calendar/events/5/reschedule")
            .send({ next_activity_date: "22/10/2026" })
            .expect(422);
        await request(app)
            .post("/cms-Calendar/events/5/reschedule")
            .send({ next_activity_date: "2026-10-22", scheduled_time: "25:00" })
            .expect(422);
        await request(app)
            .post("/cms-Calendar/events/999/reschedule")
            .send({ next_activity_date: "2026-10-22" })
            .expect(404);

        assert.equal(updateDate.mock.callCount(), 1);
    });

    it("rejeita intervalo inválido no calendário", async () => {
        const select = mock.method(Activity, "selectActivitiesForCalendar", async () => []);
        await request(app).get("/cms-Calendar/events").expect(400);
        await request(app)
            .get("/cms-Calendar/events")
            .query({ start: "2026-11-01", end: "2026-10-01" })
            .expect(400);
        await request(app)
            .get("/cms-Calendar/events")
            .query({ start: "2020-01-01", end: "2026-01-01" })
            .expect(400);
        assert.equal(select.mock.callCount(), 0);
    });

    it("retorna o fragmento da visualização para o pop-up, sem layout", async () => {
        mock.method(Activity, "selectActivityById", async () => ({
            id: 7,
            life_sphere: "Profissão e Carreira",
            description: "Revisar <contrato>",
            activity_type: "Prioridade",
            next_activity_date: "2026-10-20",
            final_deadline: null,
            day_period: null,
            scheduled_time: null,
            action_type: null,
            theme_organization: null,
            notes: "Linha 1\nLinha 2",
            status: 1,
            recurrence_rule: null,
        }));

        const res = await request(app).get("/cms-Activity-V/7/detalhes").expect(200);

        assert.doesNotMatch(res.text, /<html|<nav|<script/);
        assert.match(res.text, /data-activity-view-title="Atividade nº 7"/);
        assert.match(res.text, /Revisar &lt;contrato&gt;/); // valores escapados
        assert.match(res.text, /20\/10\/2026/);
        assert.match(res.text, /class="mb-0 activity-notes">Linha 1\nLinha 2</);
        assert.doesNotMatch(res.text, /style="/); // sem estilo inline (CSP)
    });

    it("retorna 404 no fragmento de atividade inexistente", async () => {
        mock.method(Activity, "selectActivityById", async () => null);
        await request(app).get("/cms-Activity-V/999/detalhes").expect(404);
    });

    it("consulta e calendário abrem a visualização em pop-up", async () => {
        mock.method(Activity, "countActivities", async () => 1);
        mock.method(Activity, "selectActivities", async () => [
            {
                id: 7,
                life_sphere: "Profissão e Carreira",
                description: "Revisar contrato",
                activity_type: "Normal",
                next_activity_date: "2026-10-20",
                final_deadline: null,
                status: 1,
            },
        ]);

        const list = await request(app).get("/cms-Activity-Q?status=all").expect(200);
        assert.equal(list.text.match(/data-activity-view="7"/g).length, 2); // descrição + botão
        assert.match(list.text, /id="activityViewModal"/);
        assert.match(list.text, /src="\/scripts\/activity-view-modal.js"/);

        const calendar = await request(app).get("/cms-Calendar").expect(200);
        assert.match(calendar.text, /id="activityViewModal"/);
        assert.match(calendar.text, /src="\/scripts\/activity-view-modal.js"/);
    });

    it("exclui uma atividade com exclusão lógica", async () => {
        const del = mock.method(Activity, "deleteActivity", async () => 1);

        const res = await request(app).post("/cms-Activity-D/15").expect(303);

        assert.equal(res.headers.location, "/cms-Activity-Q?msg=deleted");
        assert.equal(del.mock.callCount(), 1);
        assert.equal(del.mock.calls[0].arguments[0], 15);
    });
});
