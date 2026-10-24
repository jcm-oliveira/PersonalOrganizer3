process.env.NODE_ENV = "test";
process.env.DATABASE_URL = "mysql://app_user:Senha123@localhost:3306/test";

const { describe, it, afterEach, mock } = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
const Activity = require("../src/model/ActivityModel");
const { createApp } = require("../src/app");
const { TEST_ADMIN } = require("./helpers");
const {
    buildRecurrence,
    nextOccurrence,
    occurrencesBetween,
    ruleToFormValues,
    describeRecurrence,
} = require("../src/validation/recurrence");

const app = createApp({ currentUser: TEST_ADMIN, csrf: false });

const baseActivity = {
    id: 20,
    life_sphere: "Financeiro e Bens",
    description: "Pagar condomínio",
    activity_type: "Prioridade",
    next_activity_date: "2026-10-15",
    final_deadline: null,
    day_period: null,
    scheduled_time: null,
    periodicity: null,
    action_type: null,
    theme_organization: null,
    notes: null,
    status: 1,
};

const validForm = {
    life_sphere: "Financeiro e Bens",
    description: "Pagar condomínio",
    activity_type: "Prioridade",
    next_activity_date: "2026-10-13",
    status: "1",
};

describe("Recorrência de atividades (RRULE)", () => {
    afterEach(() => mock.restoreAll());

    describe("regras", () => {
        it("todo segundo sábado do mês começa na primeira ocorrência válida", () => {
            const result = buildRecurrence(
                {
                    recurrence_freq: "MONTHLY",
                    recurrence_monthly_mode: "weekday",
                    recurrence_setpos: "2",
                    recurrence_setpos_weekday: "SA",
                },
                "2026-10-13",
            );
            assert.equal(result.rule, "FREQ=MONTHLY;INTERVAL=1;BYDAY=SA;BYSETPOS=2");
            assert.equal(result.nextActivityDate, "2026-11-14"); // 10/10 já passou
            assert.equal(describeRecurrence(result.rule), "Todo mês, no 2º sábado");
            assert.equal(nextOccurrence(result.rule, "2026-11-14"), "2026-12-12");
        });

        it("todo dia 15 e último dia do mês", () => {
            const day15 = buildRecurrence(
                { recurrence_freq: "MONTHLY", recurrence_month_day: "15" },
                "2026-10-13",
            );
            assert.equal(day15.nextActivityDate, "2026-10-15");
            assert.equal(describeRecurrence(day15.rule), "Todo mês, no dia 15");
            assert.equal(nextOccurrence(day15.rule, "2026-10-15"), "2026-11-15");

            const lastDay = buildRecurrence(
                { recurrence_freq: "MONTHLY", recurrence_month_day: "-1" },
                "2026-10-13",
            );
            assert.equal(lastDay.nextActivityDate, "2026-10-31");
            assert.equal(nextOccurrence(lastDay.rule, "2026-10-31"), "2026-11-30");
            assert.equal(describeRecurrence(lastDay.rule), "Todo mês, no último dia");
        });

        it("quinzenal em dias da semana, com data de término", () => {
            const result = buildRecurrence(
                {
                    recurrence_freq: "WEEKLY",
                    recurrence_interval: "2",
                    recurrence_weekdays: ["MO", "WE"],
                    recurrence_end: "until",
                    recurrence_until: "2026-11-30",
                },
                "2026-10-13",
            );
            assert.equal(result.nextActivityDate, "2026-10-14");
            assert.equal(
                describeRecurrence(result.rule),
                "A cada 2 semanas, às segundas e quartas, até 30/11/2026",
            );
            assert.equal(nextOccurrence(result.rule, "2026-10-14"), "2026-10-26");
            assert.equal(nextOccurrence(result.rule, "2026-10-26"), "2026-10-28");
            assert.equal(nextOccurrence(result.rule, "2026-11-25"), null); // passou do término
        });

        it("término por quantidade vira data final", () => {
            const result = buildRecurrence(
                { recurrence_freq: "DAILY", recurrence_end: "count", recurrence_count: "3" },
                "2026-10-13",
            );
            assert.match(result.rule, /UNTIL=20261015T000000Z/);
            assert.equal(nextOccurrence(result.rule, "2026-10-14"), "2026-10-15");
            assert.equal(nextOccurrence(result.rule, "2026-10-15"), null);
        });

        it("sem repetição e erros de validação", () => {
            assert.deepEqual(buildRecurrence({ recurrence_freq: "" }, "2026-10-13"), {
                rule: null,
                nextActivityDate: "2026-10-13",
            });
            assert.equal(
                buildRecurrence({ recurrence_freq: "WEEKLY" }, "2026-10-13").error,
                "Selecione ao menos um dia da semana.",
            );
            assert.equal(
                buildRecurrence({ recurrence_freq: "DAILY", recurrence_end: "until" }, "2026-10-13")
                    .error,
                "Informe a data de término da repetição.",
            );
            assert.match(
                buildRecurrence(
                    {
                        recurrence_freq: "DAILY",
                        recurrence_end: "until",
                        recurrence_until: "2026-10-01",
                    },
                    "2026-10-13",
                ).error,
                /posterior/,
            );
        });

        it("lista ocorrências do período e recompõe o formulário a partir da regra", () => {
            assert.deepEqual(
                occurrencesBetween(
                    "FREQ=MONTHLY;BYMONTHDAY=15",
                    "2026-10-15",
                    "2026-09-27",
                    "2026-12-16",
                ),
                ["2026-10-15", "2026-11-15", "2026-12-15"],
            );
            assert.deepEqual(ruleToFormValues("FREQ=MONTHLY;BYDAY=SA;BYSETPOS=2"), {
                recurrence_freq: "MONTHLY",
                recurrence_interval: "1",
                recurrence_weekdays: ["SA"],
                recurrence_end: "never",
                recurrence_until: "",
                recurrence_monthly_mode: "weekday",
                recurrence_setpos: "2",
                recurrence_setpos_weekday: "SA",
            });
            assert.deepEqual(ruleToFormValues(null), { recurrence_freq: "" });
            assert.deepEqual(ruleToFormValues("lixo"), { recurrence_freq: "" });
        });
    });

    describe("telas e rotas", () => {
        it("insere atividade recorrente alinhando a data à primeira ocorrência", async () => {
            const insert = mock.method(Activity, "insertActivity", async () => 30);

            await request(app)
                .post("/cms-Activity-C")
                .type("form")
                .send({
                    ...validForm,
                    recurrence_freq: "MONTHLY",
                    recurrence_monthly_mode: "weekday",
                    recurrence_setpos: "2",
                    recurrence_setpos_weekday: "SA",
                })
                .expect(303);

            const data = insert.mock.calls[0].arguments[0];
            assert.equal(data.recurrence_rule, "FREQ=MONTHLY;INTERVAL=1;BYDAY=SA;BYSETPOS=2");
            assert.equal(data.next_activity_date, "2026-11-14");
        });

        it("recusa repetição inválida e mostra a mensagem no formulário", async () => {
            const insert = mock.method(Activity, "insertActivity", async () => 30);

            const res = await request(app)
                .post("/cms-Activity-C")
                .type("form")
                .send({ ...validForm, recurrence_freq: "WEEKLY" })
                .expect(422);

            assert.equal(insert.mock.callCount(), 0);
            assert.match(res.text, /Selecione ao menos um dia da semana\./);
            assert.match(res.text, /<option value="WEEKLY" selected>Semanalmente<\/option>/);
        });

        it("tela de edição vem com a repetição preenchida", async () => {
            mock.method(Activity, "selectActivityById", async () => ({
                ...baseActivity,
                recurrence_rule: "FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE",
            }));

            const res = await request(app).get("/cms-Activity-U/20").expect(200);

            assert.match(res.text, /<option value="WEEKLY" selected>Semanalmente<\/option>/);
            assert.match(res.text, /name="recurrence_interval"[^>]*value="2"/);
            assert.match(res.text, /value="MO" autocomplete="off" checked/);
            assert.match(res.text, /value="WE" autocomplete="off" checked/);
            assert.doesNotMatch(res.text, /value="FR" autocomplete="off" checked/);
            assert.match(res.text, /src="\/scripts\/activity-form.js"/);
            // Periodicidade foi substituída pela Repetição
            assert.doesNotMatch(res.text, /name="periodicity"|for="periodicity"/);
            assert.doesNotMatch(res.text, /<script>/); // sem script inline (CSP)
        });

        it("consulta mostra o ícone de repetição e o botão Concluir ocorrência", async () => {
            mock.method(Activity, "countActivities", async () => 2);
            // Só o bloco Programadas (sem activityTypeIn) traz as atividades
            mock.method(Activity, "selectActivities", async ({ activityTypeIn }) =>
                activityTypeIn
                    ? []
                    : [
                          { ...baseActivity, recurrence_rule: "FREQ=MONTHLY;BYMONTHDAY=15" },
                          { ...baseActivity, id: 21, description: "Avulsa", recurrence_rule: null },
                      ],
            );

            const res = await request(app).get("/cms-Activity-Q").expect(200);

            assert.match(res.text, /title="Repete: Todo mês, no dia 15"/);
            assert.match(res.text, /<span class="activity-th-label">Repetição<\/span>/);
            assert.doesNotMatch(res.text, /activity-th-label">Periodicidade/);
            assert.match(
                res.text,
                /<td class="c-recurrence align-middle text-center">\s*Todo mês, no dia 15\s*<\/td>/,
            );
            assert.match(
                res.text,
                /data-target="#occurrenceModal"[\s\S]*?data-activity-id="20"[\s\S]*?data-next-occurrence="2026-11-15"/,
            );
            assert.equal(res.text.match(/data-target="#occurrenceModal"/g).length, 1);
            assert.match(res.text, /id="occurrenceModal"/);
        });

        it("concluir ocorrência avança para a próxima data da repetição", async () => {
            mock.method(Activity, "selectActivityById", async () => ({
                ...baseActivity,
                recurrence_rule: "FREQ=MONTHLY;BYMONTHDAY=15",
            }));
            const update = mock.method(Activity, "updateNextActivityDate", async () => 1);

            const res = await request(app)
                .post("/cms-Activity-O/20")
                .type("form")
                .send({ returnTo: "/cms-Activity-Q?status=all" })
                .expect(303);

            assert.deepEqual(update.mock.calls[0].arguments, [20, "2026-11-15"]);
            assert.equal(res.headers.location, "/cms-Activity-Q?status=all&msg=occurrenceDone");
        });

        it("concluir a última ocorrência avisa que a série terminou", async () => {
            mock.method(Activity, "selectActivityById", async () => ({
                ...baseActivity,
                recurrence_rule: "FREQ=MONTHLY;BYMONTHDAY=15;UNTIL=20261015T000000Z",
            }));
            const update = mock.method(Activity, "updateNextActivityDate", async () => 1);

            const res = await request(app).post("/cms-Activity-O/20").expect(303);

            assert.equal(update.mock.callCount(), 0);
            assert.equal(res.headers.location, "/cms-Activity-Q?msg=seriesEnded");
        });

        it("concluir ocorrência de atividade não recorrente é recusado", async () => {
            mock.method(Activity, "selectActivityById", async () => ({
                ...baseActivity,
                recurrence_rule: null,
            }));
            const update = mock.method(Activity, "updateNextActivityDate", async () => 1);

            const res = await request(app).post("/cms-Activity-O/20").expect(303);

            assert.equal(update.mock.callCount(), 0);
            assert.equal(res.headers.location, "/cms-Activity-Q?msg=notRecurring");
        });

        it("calendário mostra as ocorrências futuras como somente leitura", async () => {
            mock.method(Activity, "selectActivitiesForCalendar", async () => [
                { ...baseActivity, recurrence_rule: "FREQ=MONTHLY;BYMONTHDAY=15" },
            ]);

            const res = await request(app)
                .get("/cms-Calendar/events")
                .query({ start: "2026-09-27", end: "2027-01-01" })
                .expect(200);

            assert.deepEqual(
                res.body.map((e) => [e.id, e.start, e.editable, e.extendedProps.kind]),
                [
                    ["20", "2026-10-15", true, "next"],
                    ["occurrence-20-2026-11-15", "2026-11-15", false, "occurrence"],
                    ["occurrence-20-2026-12-15", "2026-12-15", false, "occurrence"],
                ],
            );
            assert.equal(res.body[0].extendedProps.recurrence, "Todo mês, no dia 15");
        });

        it("visualização mostra a repetição e a ocorrência seguinte", async () => {
            mock.method(Activity, "selectActivityById", async () => ({
                ...baseActivity,
                recurrence_rule: "FREQ=MONTHLY;BYMONTHDAY=15",
            }));

            const res = await request(app).get("/cms-Activity-V/20").expect(200);

            assert.match(res.text, /Todo mês, no dia 15/);
            assert.match(res.text, /Ocorrência seguinte: 15\/11\/2026/);
        });
    });
});
