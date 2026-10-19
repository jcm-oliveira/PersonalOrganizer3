// Login, sessão, CSRF e permissões com o fluxo real (sem usuário fixo).
require("./helpers");

const { describe, it, afterEach, mock, before } = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
const UserModel = require("../src/model/UserModel");
const AccessProfileModel = require("../src/model/AccessProfileModel");
const Activity = require("../src/model/ActivityModel");
const { createApp } = require("../src/app");
const { hashPassword, verifyPassword } = require("../src/security/password");
const { can, permissionsFromForm, buildPermissionMap } = require("../src/security/permissions");

const PASSWORD = "senha-forte-123";
let passwordHash;

before(async () => {
    passwordHash = await hashPassword(PASSWORD);
});

function csrfFrom(html) {
    const match = /name="_csrf" value="([^"]+)"/.exec(html);
    assert.ok(match, "token CSRF não encontrado na página");
    return match[1];
}

// Usuário da sessão: perfis e linhas de permissão como vêm do banco
function sessionUser({ isAdmin = false, permissionRows = [], sessionVersion = 0 } = {}) {
    return {
        id: 7,
        name: "Maria Teste",
        email: "maria@teste.local",
        photo_file: null,
        session_version: sessionVersion,
        profiles: isAdmin
            ? [{ id: 1, name: "Administrador", is_system: 1 }]
            : [{ id: 2, name: "Consulta", is_system: 0 }],
        permissionRows,
    };
}

function mockLogin(user) {
    mock.method(UserModel, "countUsers", async () => 1);
    mock.method(UserModel, "findForLogin", async (email) =>
        email === "maria@teste.local"
            ? {
                  id: 7,
                  name: "Maria Teste",
                  email,
                  password_hash: passwordHash,
                  status: 1,
                  session_version: 0,
              }
            : null,
    );
    mock.method(UserModel, "updateLastLogin", async () => {});
    mock.method(UserModel, "findSessionUser", async () => user);
}

async function loginAgent(user) {
    mockLogin(user);
    const agent = request.agent(createApp());
    const page = await agent.get("/login").expect(200);
    await agent
        .post("/login")
        .type("form")
        .send({
            _csrf: csrfFrom(page.text),
            email: "maria@teste.local",
            password: PASSWORD,
            next: "/",
        })
        .expect(303);
    return agent;
}

describe("Senhas (scrypt)", () => {
    it("gera hash com sal e confere a senha", async () => {
        const hash = await hashPassword("minha-senha-1");
        assert.match(hash, /^scrypt\$32768\$8\$1\$[\w-]+\$[\w-]+$/);
        assert.notEqual(hash, await hashPassword("minha-senha-1")); // sal diferente
        assert.equal(await verifyPassword("minha-senha-1", hash), true);
        assert.equal(await verifyPassword("outra-senha", hash), false);
        assert.equal(await verifyPassword("x", "texto-puro"), false);
        assert.equal(await verifyPassword("x", null), false);
    });
});

describe("Permissões", () => {
    it("soma perfis, ignora telas desconhecidas e respeita o Administrador", () => {
        const map = buildPermissionMap([
            { resource: "activities", can_view: 1, can_create: 0, can_update: 1, can_delete: 0 },
            { resource: "activities", can_view: 0, can_create: 1, can_update: 0, can_delete: 0 },
            { resource: "dashboard", can_view: 1, can_create: 1, can_update: 1, can_delete: 1 },
            { resource: "inexistente", can_view: 1, can_create: 0, can_update: 0, can_delete: 0 },
        ]);
        const user = { isAdmin: false, permissions: map };
        assert.equal(can(user, "activities", "create"), true);
        assert.equal(can(user, "activities", "delete"), false);
        assert.equal(can(user, "dashboard", "view"), true);
        assert.equal(can(user, "dashboard", "create"), false); // ação não existe na tela
        assert.equal(can(user, "inexistente", "view"), false);
        assert.equal(can({ isAdmin: true }, "qualquer", "delete"), true);
        assert.equal(can(null, "activities", "view"), false);
    });

    it("normaliza a matriz do formulário (ações implicam visualizar)", () => {
        assert.deepEqual(
            permissionsFromForm(["activities:update", "calendar:delete", "users:view", "x:view"]),
            [
                {
                    resource: "activities",
                    can_view: 1,
                    can_create: 0,
                    can_update: 1,
                    can_delete: 0,
                },
                { resource: "users", can_view: 1, can_create: 0, can_update: 0, can_delete: 0 },
            ],
        );
        assert.deepEqual(permissionsFromForm(undefined), []);
        assert.deepEqual(permissionsFromForm("dashboard:view"), [
            { resource: "dashboard", can_view: 1, can_create: 0, can_update: 0, can_delete: 0 },
        ]);
    });
});

describe("Login e sessão", () => {
    afterEach(() => mock.restoreAll());

    it("sem login, as telas levam ao login (voltando depois para a mesma tela)", async () => {
        const app = createApp();
        const res = await request(app).get("/cms-Activity-Q?status=all").expect(303);
        assert.equal(res.headers.location, "/login?next=%2Fcms-Activity-Q%3Fstatus%3Dall");
        await request(app).get("/").expect(303);
        await request(app).get("/cms-User-Q").expect(303);
    });

    it("sem nenhum usuário cadastrado, o login leva ao primeiro acesso", async () => {
        mock.method(UserModel, "countUsers", async () => 0);
        const res = await request(createApp()).get("/login").expect(303);
        assert.equal(res.headers.location, "/setup");
    });

    it("tela de login sem menu, com token CSRF e cookie de sessão seguro", async () => {
        mock.method(UserModel, "countUsers", async () => 1);
        const res = await request(createApp()).get("/login").expect(200);
        assert.doesNotMatch(res.text, /<nav class="navbar/);
        csrfFrom(res.text);
        const cookie = res.headers["set-cookie"].join(";");
        assert.match(cookie, /po\.sid=/);
        assert.match(cookie, /HttpOnly/);
        assert.match(cookie, /SameSite=Lax/);
    });

    it("recusa POST sem token CSRF", async () => {
        mockLogin(sessionUser({ isAdmin: true }));
        const res = await request(createApp())
            .post("/login")
            .type("form")
            .send({ email: "maria@teste.local", password: PASSWORD })
            .expect(403);
        assert.match(res.text, /Formulário expirado ou inválido/);
    });

    it("senha errada ou e-mail inexistente: mesma mensagem genérica", async () => {
        mockLogin(sessionUser({ isAdmin: true }));
        const agent = request.agent(createApp());
        const page = await agent.get("/login");
        const token = csrfFrom(page.text);

        const wrong = await agent
            .post("/login")
            .type("form")
            .send({ _csrf: token, email: "maria@teste.local", password: "errada-123" })
            .expect(401);
        assert.match(wrong.text, /E-mail ou senha inválidos\./);

        const unknown = await agent
            .post("/login")
            .type("form")
            .send({ _csrf: token, email: "ninguem@teste.local", password: PASSWORD })
            .expect(401);
        assert.match(unknown.text, /E-mail ou senha inválidos\./);
    });

    it("usuário inativo não entra", async () => {
        mockLogin(sessionUser({ isAdmin: true }));
        mock.method(UserModel, "findForLogin", async () => ({
            id: 7,
            email: "maria@teste.local",
            password_hash: passwordHash,
            status: 0,
            session_version: 0,
        }));
        const agent = request.agent(createApp());
        const page = await agent.get("/login");
        await agent
            .post("/login")
            .type("form")
            .send({ _csrf: csrfFrom(page.text), email: "maria@teste.local", password: PASSWORD })
            .expect(401);
    });

    it("login correto volta para a tela pedida e mostra o usuário no menu", async () => {
        mockLogin(sessionUser({ isAdmin: true }));
        const agent = request.agent(createApp());
        const page = await agent.get("/login?next=%2Fdashboard");
        assert.match(page.text, /name="next" value="\/dashboard"/);
        const res = await agent
            .post("/login")
            .type("form")
            .send({
                _csrf: csrfFrom(page.text),
                email: "Maria@Teste.Local",
                password: PASSWORD,
                next: "/dashboard",
            })
            .expect(303);
        assert.equal(res.headers.location, "/dashboard");
        assert.equal(UserModel.updateLastLogin.mock.callCount(), 1);

        const home = await agent.get("/").expect(200);
        assert.match(home.text, /class="nav-user__name">Maria Teste</);
        assert.match(home.text, /href="\/cms-User-Q"/); // administrador vê o cadastro de usuários
    });

    it("não redireciona para outro site após o login", async () => {
        mockLogin(sessionUser({ isAdmin: true }));
        const agent = request.agent(createApp());
        const page = await agent.get("/login");
        const res = await agent
            .post("/login")
            .type("form")
            .send({
                _csrf: csrfFrom(page.text),
                email: "maria@teste.local",
                password: PASSWORD,
                next: "//site-externo.com",
            })
            .expect(303);
        assert.equal(res.headers.location, "/");
    });

    it("senha trocada ou usuário inativado em outro lugar encerra a sessão", async () => {
        const agent = await loginAgent(sessionUser({ isAdmin: true }));
        await agent.get("/").expect(200);
        // session_version mudou no banco
        mock.method(UserModel, "findSessionUser", async () =>
            sessionUser({ isAdmin: true, sessionVersion: 1 }),
        );
        await agent.get("/").expect(303);
        // usuário inativado/excluído
        mock.method(UserModel, "findSessionUser", async () => null);
        await agent.get("/").expect(303);
    });

    it("sair encerra a sessão", async () => {
        const agent = await loginAgent(sessionUser({ isAdmin: true }));
        const home = await agent.get("/").expect(200);
        const res = await agent
            .post("/logout")
            .type("form")
            .send({ _csrf: csrfFrom(home.text) })
            .expect(303);
        assert.equal(res.headers.location, "/login?msg=logout");
        await agent.get("/").expect(303);
    });

    it("limita as tentativas de login", async () => {
        mockLogin(sessionUser({ isAdmin: true }));
        const agent = request.agent(createApp());
        const page = await agent.get("/login");
        const token = csrfFrom(page.text);
        let last;
        for (let i = 0; i < 11; i++) {
            last = await agent
                .post("/login")
                .type("form")
                .send({ _csrf: token, email: "ninguem@teste.local", password: "x" });
        }
        assert.equal(last.status, 429);
        assert.match(last.text, /Muitas tentativas de login/);
    });
});

describe("Primeiro acesso", () => {
    afterEach(() => mock.restoreAll());

    it("cria o administrador com o perfil de sistema e já entra", async () => {
        mock.method(UserModel, "countUsers", async () => 0);
        mock.method(AccessProfileModel, "findSystemProfileId", async () => 1);
        const insert = mock.method(UserModel, "insert", async () => 7);
        mock.method(UserModel, "updateLastLogin", async () => {});
        mock.method(UserModel, "findSessionUser", async () => sessionUser({ isAdmin: true }));

        const agent = request.agent(createApp());
        const page = await agent.get("/setup").expect(200);
        const res = await agent
            .post("/setup")
            .type("form")
            .send({
                _csrf: csrfFrom(page.text),
                name: "Maria Teste",
                email: "MARIA@teste.local",
                password: PASSWORD,
                password_confirm: PASSWORD,
            })
            .expect(303);
        assert.equal(res.headers.location, "/");

        const [data, profileIds] = insert.mock.calls[0].arguments;
        assert.equal(data.email, "maria@teste.local");
        assert.equal(await verifyPassword(PASSWORD, data.password_hash), true);
        assert.deepEqual(profileIds, [1]);
        await agent.get("/").expect(200);
    });

    it("não fica disponível depois que existe usuário", async () => {
        mock.method(UserModel, "countUsers", async () => 1);
        const insert = mock.method(UserModel, "insert", async () => 7);
        const app = createApp();
        const res = await request(app).get("/setup").expect(303);
        assert.equal(res.headers.location, "/login");
        assert.equal(insert.mock.callCount(), 0);
    });

    it("valida senha e confirmação", async () => {
        mock.method(UserModel, "countUsers", async () => 0);
        const agent = request.agent(createApp());
        const page = await agent.get("/setup");
        const res = await agent
            .post("/setup")
            .type("form")
            .send({
                _csrf: csrfFrom(page.text),
                name: "Maria",
                email: "maria@teste.local",
                password: "curta",
                password_confirm: "outra",
            })
            .expect(422);
        assert.match(res.text, /no mínimo 8 caracteres/);
    });
});

describe("Bloqueio conforme o perfil", () => {
    afterEach(() => mock.restoreAll());

    // Perfil "Consulta": só visualiza Atividades
    const viewOnly = sessionUser({
        permissionRows: [
            { resource: "activities", can_view: 1, can_create: 0, can_update: 0, can_delete: 0 },
        ],
    });

    it("permite só o que o perfil libera", async () => {
        mock.method(Activity, "countActivities", async () => 1);
        mock.method(Activity, "selectActivities", async () => [
            {
                id: 3,
                life_sphere: "Profissão e Carreira",
                description: "Atividade fictícia",
                relevance: "Normal",
                next_activity_date: "2026-10-30",
                final_deadline: null,
                status: 1,
            },
        ]);
        const remove = mock.method(Activity, "deleteActivity", async () => 1);
        const agent = await loginAgent(viewOnly);

        const list = await agent.get("/cms-Activity-Q?status=all").expect(200);
        // Sem botões de inserir/alterar
        assert.doesNotMatch(list.text, /href="\/cms-Activity-C"/);
        assert.doesNotMatch(list.text, /title="Editar atividade"/);
        assert.doesNotMatch(list.text, /data-target="#rescheduleModal"/);
        assert.match(list.text, /title="Visualizar atividade"/);
        // Menu só com o permitido
        assert.match(list.text, /href="\/cms-Activity-Q">Atividades/);
        assert.doesNotMatch(list.text, /href="\/dashboard"|href="\/cms-Calendar"|Cadastros/);

        await agent.get("/cms-Activity-C").expect(403);
        await agent.get("/dashboard").expect(403);
        await agent.get("/cms-User-Q").expect(403);
        await agent.get("/cms-LifeSphere-Q").expect(403);
        await agent.get("/cms-Periodicity-Q").expect(403); // só Administrador
        const token = csrfFrom(list.text);
        await agent.post("/cms-Activity-D/3").type("form").send({ _csrf: token }).expect(403);
        await agent.post("/cms-Activity-R/3").type("form").send({ _csrf: token }).expect(403);
        assert.equal(remove.mock.callCount(), 0);
    });

    it("sem nenhum perfil, a tela inicial avisa que não há acesso", async () => {
        const agent = await loginAgent(sessionUser({ permissionRows: [] }));
        const home = await agent.get("/").expect(200);
        assert.match(home.text, /não tem acesso a nenhuma tela/);
    });

    it("calendário só deixa arrastar com permissão de alterar", async () => {
        mock.method(Activity, "selectActivitiesForCalendar", async () => [
            {
                id: 3,
                life_sphere: "Profissão e Carreira",
                description: "Atividade fictícia",
                relevance: "Normal",
                next_activity_date: "2026-10-20",
                final_deadline: null,
                scheduled_time: null,
                status: 1,
                recurrence_rule: null,
            },
        ]);
        const agent = await loginAgent(
            sessionUser({
                permissionRows: [
                    {
                        resource: "calendar",
                        can_view: 1,
                        can_create: 0,
                        can_update: 0,
                        can_delete: 0,
                    },
                ],
            }),
        );
        const events = await agent
            .get("/cms-Calendar/events")
            .query({ start: "2026-10-01", end: "2026-11-01" })
            .expect(200);
        assert.equal(events.body[0].editable, false);
        const page = await agent.get("/cms-Calendar").expect(200);
        assert.doesNotMatch(page.text, /Arraste uma atividade/);
        await agent
            .post("/cms-Calendar/events/3/reschedule")
            .set("X-CSRF-Token", csrfFrom(page.text))
            .send({ next_activity_date: "2026-10-21" })
            .expect(403);
    });

    it("pedido do calendário com token no cabeçalho é aceito", async () => {
        const update = mock.method(Activity, "updateNextActivityDate", async () => 1);
        const agent = await loginAgent(sessionUser({ isAdmin: true }));
        const page = await agent.get("/").expect(200);
        const token = /name="csrf-token" content="([^"]+)"/.exec(page.text)[1];
        await agent
            .post("/cms-Calendar/events/3/reschedule")
            .set("X-CSRF-Token", token)
            .send({ next_activity_date: "2026-10-21" })
            .expect(200);
        await agent
            .post("/cms-Calendar/events/3/reschedule")
            .send({ next_activity_date: "2026-10-21" })
            .expect(403);
        assert.equal(update.mock.callCount(), 1);
    });
});

describe("Troca da própria senha", () => {
    afterEach(() => mock.restoreAll());

    it("exige a senha atual e mantém a sessão", async () => {
        const agent = await loginAgent(sessionUser({ isAdmin: true }));
        const updatePassword = mock.method(UserModel, "updatePassword", async () => 1);
        const page = await agent.get("/minha-conta/senha").expect(200);
        const token = csrfFrom(page.text);

        const wrong = await agent
            .post("/minha-conta/senha")
            .type("form")
            .send({
                _csrf: token,
                current_password: "errada",
                new_password: "nova-senha-123",
                password_confirm: "nova-senha-123",
            })
            .expect(422);
        assert.match(wrong.text, /Senha atual incorreta/);

        const res = await agent
            .post("/minha-conta/senha")
            .type("form")
            .send({
                _csrf: token,
                current_password: PASSWORD,
                new_password: "nova-senha-123",
                password_confirm: "nova-senha-123",
            })
            .expect(303);
        assert.equal(res.headers.location, "/minha-conta/senha?msg=changed");
        assert.equal(
            await verifyPassword("nova-senha-123", updatePassword.mock.calls[0].arguments[1]),
            true,
        );

        // Sessão continua válida com a nova versão
        mock.method(UserModel, "findSessionUser", async () =>
            sessionUser({ isAdmin: true, sessionVersion: 1 }),
        );
        await agent.get("/minha-conta/senha?msg=changed").expect(200);
    });
});
