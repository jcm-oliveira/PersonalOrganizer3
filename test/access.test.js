// Cadastros de Usuários e Perfis de Acesso (com administrador fixo; login em auth.test.js).
const { TEST_ADMIN, createAdminApp } = require("./helpers");

const fs = require("node:fs");
const path = require("node:path");
const { describe, it, afterEach, mock } = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
const UserModel = require("../src/model/UserModel");
const AccessProfileModel = require("../src/model/AccessProfileModel");
const { verifyPassword } = require("../src/security/password");
const { USER_PHOTO_DIR } = require("../src/middlewares/upload");

const app = createAdminApp();

// Menor PNG válido (1x1)
const PNG_1X1 = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
    "base64",
);

const PROFILES = [
    { id: 1, name: "Administrador", description: "Acesso total", is_system: 1 },
    { id: 2, name: "Consulta", description: "Somente leitura", is_system: 0 },
];

function mockProfiles() {
    mock.method(AccessProfileModel, "selectActiveOptions", async () => PROFILES);
}

const existingUser = {
    id: 9,
    name: "João Teste",
    email: "joao@teste.local",
    phone: null,
    description: null,
    photo_file: null,
    status: 1,
    last_login_at: null,
    profiles: [{ id: 2, name: "Consulta", is_system: 0 }],
};

function cleanupPhoto(fileName) {
    if (fileName) fs.rmSync(path.join(USER_PHOTO_DIR, fileName), { force: true });
}

describe("Cadastro de Usuários", () => {
    afterEach(() => mock.restoreAll());

    it("lista usuários com perfis, foto/iniciais e ações", async () => {
        mockProfiles();
        mock.method(UserModel, "count", async () => 2);
        const select = mock.method(UserModel, "selectList", async () => [
            { ...existingUser, profile_names: "Consulta" },
            {
                id: 1,
                name: "Administrador de Teste",
                email: "admin@teste.local",
                phone: "(11) 3333-4444",
                photo_file: "0123456789abcdef0123456789abcdef.png",
                status: 1,
                last_login_at: null,
                profile_names: "Administrador",
            },
        ]);

        const res = await request(app).get("/cms-User-Q?search=teste&profileId=2").expect(200);

        assert.deepEqual(
            { ...select.mock.calls[0].arguments[0] },
            { status: 1, search: "teste", profileId: 2, limit: 10, offset: 0 },
        );
        assert.match(res.text, /João Teste/);
        assert.match(res.text, /user-avatar--initials" aria-hidden="true">JT</);
        assert.match(res.text, /src="\/cms-User\/1\/foto\?v=01234567"/);
        assert.match(res.text, /href="\/cms-User-U\/9"/);
        assert.match(res.text, /data-delete-action="\/cms-User-D\/9"/);
        // O próprio usuário logado (id 1) não tem botão de excluir
        assert.doesNotMatch(res.text, /data-delete-action="\/cms-User-D\/1"/);
        assert.match(res.text, /você<\/span>/);
    });

    it("insere usuário com foto, perfis e senha em hash", async () => {
        mockProfiles();
        mock.method(UserModel, "emailInUse", async () => false);
        const insert = mock.method(UserModel, "insert", async () => 10);

        const res = await request(app)
            .post("/cms-User-C")
            .field("name", "Ana Teste")
            .field("email", "Ana@Teste.Local")
            .field("phone", "(11) 98888-7777")
            .field("description", "Equipe de testes")
            .field("status", "1")
            .field("profile_ids", "2")
            .field("profile_ids", "999") // perfil inexistente é ignorado
            .field("password", "senha-forte-123")
            .field("password_confirm", "senha-forte-123")
            .attach("photo", PNG_1X1, { filename: "eu.png", contentType: "image/png" })
            .expect(303);

        assert.equal(res.headers.location, "/cms-User-Q?msg=created");
        const [data, profileIds] = insert.mock.calls[0].arguments;
        try {
            assert.equal(data.email, "ana@teste.local");
            assert.equal(data.phone, "(11) 98888-7777");
            assert.deepEqual(profileIds, [2]);
            assert.match(data.photo_file, /^[a-f0-9]{32}\.png$/);
            assert.ok(fs.existsSync(path.join(USER_PHOTO_DIR, data.photo_file)));
            assert.equal(await verifyPassword("senha-forte-123", data.password_hash), true);
        } finally {
            cleanupPhoto(data.photo_file);
        }
    });

    it("recusa arquivo que não é imagem (mesmo com tipo de imagem informado)", async () => {
        mockProfiles();
        mock.method(UserModel, "emailInUse", async () => false);
        const insert = mock.method(UserModel, "insert", async () => 10);
        const before = fs.readdirSync(USER_PHOTO_DIR).length;

        const res = await request(app)
            .post("/cms-User-C")
            .field("name", "Ana Teste")
            .field("email", "ana@teste.local")
            .field("password", "senha-forte-123")
            .field("password_confirm", "senha-forte-123")
            .attach("photo", Buffer.from("não sou uma imagem"), {
                filename: "x.png",
                contentType: "image/png",
            })
            .expect(422);

        assert.match(res.text, /não é uma imagem válida/);
        assert.match(res.text, /value="Ana Teste"/); // demais campos preservados
        assert.equal(insert.mock.callCount(), 0);
        assert.equal(fs.readdirSync(USER_PHOTO_DIR).length, before); // arquivo descartado
    });

    it("recusa tipo de arquivo não aceito sem perder os outros campos", async () => {
        mockProfiles();
        mock.method(UserModel, "emailInUse", async () => false);
        const res = await request(app)
            .post("/cms-User-C")
            .field("name", "Ana Teste")
            .field("email", "ana@teste.local")
            .field("password", "senha-forte-123")
            .field("password_confirm", "senha-forte-123")
            .attach("photo", Buffer.from("GIF89a"), { filename: "x.gif", contentType: "image/gif" })
            .expect(422);
        assert.match(res.text, /JPG, PNG ou WebP/);
        assert.match(res.text, /value="ana@teste.local"/);
    });

    it("valida campos, senha e e-mail duplicado", async () => {
        mockProfiles();
        mock.method(UserModel, "emailInUse", async () => true);
        const insert = mock.method(UserModel, "insert", async () => 10);

        const invalid = await request(app)
            .post("/cms-User-C")
            .field("name", "A")
            .field("email", "invalido")
            .field("phone", "abc")
            .field("password", "123")
            .field("password_confirm", "456")
            .expect(422);
        assert.match(invalid.text, /Informe o nome\./);
        assert.match(invalid.text, /Informe um e-mail válido\./);
        assert.match(invalid.text, /Telefone inválido/);
        assert.match(invalid.text, /no mínimo 8 caracteres/);

        const duplicated = await request(app)
            .post("/cms-User-C")
            .field("name", "Ana Teste")
            .field("email", "ana@teste.local")
            .field("password", "senha-forte-123")
            .field("password_confirm", "senha-forte-123")
            .expect(422);
        assert.match(duplicated.text, /Já existe um usuário com este e-mail\./);
        assert.equal(insert.mock.callCount(), 0);
    });

    it("edita mantendo a senha quando o campo fica em branco", async () => {
        mockProfiles();
        mock.method(UserModel, "selectById", async () => existingUser);
        mock.method(UserModel, "emailInUse", async () => false);
        const update = mock.method(UserModel, "update", async () => 1);

        await request(app)
            .post("/cms-User-U/9")
            .field("name", "João Teste")
            .field("email", "joao@teste.local")
            .field("status", "1")
            .field("profile_ids", "2")
            .field("password", "")
            .expect(303);

        const [id, data, profileIds] = update.mock.calls[0].arguments;
        assert.equal(id, 9);
        assert.equal(data.password_hash, undefined);
        assert.equal(data.photo_file, undefined); // mantém a foto
        assert.deepEqual(profileIds, [2]);
    });

    it("não deixa o sistema sem administrador ativo", async () => {
        mockProfiles();
        mock.method(UserModel, "selectById", async () => ({
            ...existingUser,
            profiles: [{ id: 1, name: "Administrador", is_system: 1 }],
        }));
        mock.method(UserModel, "emailInUse", async () => false);
        mock.method(UserModel, "countActiveAdmins", async () => 0);
        const update = mock.method(UserModel, "update", async () => 1);
        const remove = mock.method(UserModel, "softDelete", async () => 1);

        const res = await request(app)
            .post("/cms-User-U/9")
            .field("name", "João Teste")
            .field("email", "joao@teste.local")
            .field("status", "1")
            .field("profile_ids", "2") // tirou o perfil Administrador
            .expect(422);
        assert.match(res.text, /último administrador ativo/);
        assert.equal(update.mock.callCount(), 0);

        const del = await request(app).post("/cms-User-D/9").expect(303);
        assert.equal(del.headers.location, "/cms-User-Q?msg=lastAdmin");
        assert.equal(remove.mock.callCount(), 0);
    });

    it("não deixa inativar nem excluir o próprio usuário", async () => {
        mockProfiles();
        mock.method(UserModel, "selectById", async () => ({ ...existingUser, id: TEST_ADMIN.id }));
        mock.method(UserModel, "emailInUse", async () => false);
        mock.method(UserModel, "countActiveAdmins", async () => 3);
        const remove = mock.method(UserModel, "softDelete", async () => 1);

        const res = await request(app)
            .post(`/cms-User-U/${TEST_ADMIN.id}`)
            .field("name", "Administrador de Teste")
            .field("email", "admin@teste.local")
            .field("status", "0")
            .field("profile_ids", "1")
            .expect(422);
        assert.match(res.text, /não pode inativar o seu próprio usuário/);

        const del = await request(app).post(`/cms-User-D/${TEST_ADMIN.id}`).expect(303);
        assert.equal(del.headers.location, "/cms-User-Q?msg=selfDelete");
        assert.equal(remove.mock.callCount(), 0);
    });

    it("exclui (logicamente) outro usuário", async () => {
        mock.method(UserModel, "selectById", async () => existingUser);
        const remove = mock.method(UserModel, "softDelete", async () => 1);
        const res = await request(app).post("/cms-User-D/9").expect(303);
        assert.equal(res.headers.location, "/cms-User-Q?msg=deleted");
        assert.deepEqual(remove.mock.calls[0].arguments, [9]);
    });

    it("serve a foto só com nome gerado pelo sistema", async () => {
        const file = "abcdefabcdefabcdefabcdefabcdefab.png";
        fs.writeFileSync(path.join(USER_PHOTO_DIR, file), PNG_1X1);
        try {
            mock.method(UserModel, "selectPhotoFile", async () => file);
            const res = await request(app).get("/cms-User/9/foto").expect(200);
            assert.match(res.headers["content-type"], /image\/png/);
            assert.match(res.headers["cache-control"], /private/);

            mock.method(UserModel, "selectPhotoFile", async () => "../../.env");
            await request(app).get("/cms-User/9/foto").expect(404);
        } finally {
            cleanupPhoto(file);
        }
    });
});

describe("Cadastro de Perfis de Acesso", () => {
    afterEach(() => mock.restoreAll());

    it("lista perfis com quantidade de usuários e o perfil de sistema protegido", async () => {
        mock.method(AccessProfileModel, "count", async () => 2);
        mock.method(AccessProfileModel, "selectList", async () => [
            {
                id: 1,
                name: "Administrador",
                description: "Acesso total",
                is_system: 1,
                status: 1,
                user_count: 1,
            },
            {
                id: 2,
                name: "Consulta",
                description: "Somente leitura",
                is_system: 0,
                status: 1,
                user_count: 3,
            },
        ]);
        const res = await request(app).get("/cms-AccessProfile-Q").expect(200);
        assert.match(res.text, /<\/i>Sistema\s*<\/span>/);
        assert.match(res.text, /href="\/cms-User-Q\?status=all&amp;profileId=2"/);
        assert.match(res.text, /data-delete-action="\/cms-AccessProfile-D\/2"/);
        assert.doesNotMatch(res.text, /data-delete-action="\/cms-AccessProfile-D\/1"/);
    });

    it("tela de inserção mostra a matriz por tela e ação", async () => {
        const res = await request(app).get("/cms-AccessProfile-C").expect(200);
        assert.match(res.text, /id="permMatrix"/);
        assert.match(res.text, /name="perm" value="activities:create"/);
        assert.match(res.text, /name="perm" value="activities:delete"/);
        assert.match(res.text, /name="perm" value="dashboard:view"/);
        assert.doesNotMatch(res.text, /value="dashboard:create"/); // ação inexistente na tela
        assert.match(res.text, /name="perm" value="calendar:update"/);
        assert.match(res.text, /Alterar inclui remarcar/);
    });

    it("insere perfil normalizando as permissões", async () => {
        mock.method(AccessProfileModel, "nameInUse", async () => false);
        const insert = mock.method(AccessProfileModel, "insert", async () => 3);

        const res = await request(app)
            .post("/cms-AccessProfile-C")
            .type("form")
            .send(
                "name=Operador&description=Equipe&status=1&perm=activities:update&perm=activities:create&perm=dashboard:view&perm=hack:view",
            )
            .expect(303);

        assert.equal(res.headers.location, "/cms-AccessProfile-Q?msg=created");
        const [data, permissions] = insert.mock.calls[0].arguments;
        assert.equal(data.name, "Operador");
        assert.deepEqual(permissions, [
            { resource: "dashboard", can_view: 1, can_create: 0, can_update: 0, can_delete: 0 },
            { resource: "activities", can_view: 1, can_create: 1, can_update: 1, can_delete: 0 },
        ]);
    });

    it("valida nome obrigatório e duplicado", async () => {
        mock.method(AccessProfileModel, "nameInUse", async () => true);
        const empty = await request(app)
            .post("/cms-AccessProfile-C")
            .type("form")
            .send({ name: "" })
            .expect(422);
        assert.match(empty.text, /Informe o nome do perfil\./);
        const dup = await request(app)
            .post("/cms-AccessProfile-C")
            .type("form")
            .send("name=Consulta&perm=activities:view")
            .expect(422);
        assert.match(dup.text, /Já existe um perfil com este nome\./);
        assert.match(dup.text, /value="activities:view"[^>]*checked/); // marcações preservadas
    });

    it("edição carrega as permissões gravadas", async () => {
        mock.method(AccessProfileModel, "selectById", async () => ({
            id: 2,
            name: "Consulta",
            description: null,
            is_system: 0,
            status: 1,
            permissions: [
                {
                    resource: "activities",
                    can_view: 1,
                    can_create: 0,
                    can_update: 1,
                    can_delete: 0,
                },
            ],
        }));
        const res = await request(app).get("/cms-AccessProfile-U/2").expect(200);
        assert.match(res.text, /value="activities:view"[^>]*checked/);
        assert.match(res.text, /value="activities:update"[^>]*checked/);
        assert.doesNotMatch(res.text, /value="activities:delete"[^>]*checked/);
        assert.match(res.text, /src="\/scripts\/profile-form.js"/);
    });

    it("perfil Administrador é somente leitura e não pode ser alterado nem excluído", async () => {
        mock.method(AccessProfileModel, "selectById", async () => ({
            id: 1,
            name: "Administrador",
            description: "Acesso total",
            is_system: 1,
            status: 1,
            permissions: [],
        }));
        const update = mock.method(AccessProfileModel, "update", async () => 1);
        const remove = mock.method(AccessProfileModel, "softDelete", async () => 1);

        const page = await request(app).get("/cms-AccessProfile-U/1").expect(200);
        assert.match(page.text, /<fieldset disabled>/);
        assert.match(page.text, /tem acesso total/);
        assert.doesNotMatch(page.text, /title="Salvar perfil"/);

        const upd = await request(app)
            .post("/cms-AccessProfile-U/1")
            .type("form")
            .send({ name: "X" })
            .expect(303);
        assert.equal(upd.headers.location, "/cms-AccessProfile-Q?msg=systemProfile");
        const del = await request(app).post("/cms-AccessProfile-D/1").expect(303);
        assert.equal(del.headers.location, "/cms-AccessProfile-Q?msg=systemProfile");
        assert.equal(update.mock.callCount(), 0);
        assert.equal(remove.mock.callCount(), 0);
    });
});

describe("Menu Cadastros", () => {
    it("inclui Usuários e Perfis de Acesso no grupo Acesso", async () => {
        const res = await request(app).get("/").expect(200);
        assert.match(res.text, /<h6 class="dropdown-header">Acesso<\/h6>/);
        assert.match(res.text, /href="\/cms-User-Q"/);
        assert.match(res.text, /href="\/cms-AccessProfile-Q"/);
        assert.match(res.text, /Acesso ao Sistema/); // atalhos na tela inicial
    });
});
