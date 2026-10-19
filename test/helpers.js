// Apoio aos testes: usuário administrador fixo (dispensa login e CSRF).
// Os testes de login, CSRF e permissões ficam em test/auth.test.js e usam o fluxo real.
process.env.NODE_ENV = "test";
process.env.DATABASE_URL =
    process.env.DATABASE_URL || "mysql://app_user:Senha123@localhost:3306/test";

const TEST_ADMIN = Object.freeze({
    id: 1,
    name: "Administrador de Teste",
    email: "admin@teste.local",
    photo_file: null,
    sessionVersion: 0,
    isAdmin: true,
    profileNames: ["Administrador"],
    permissions: new Map(),
});

function createAdminApp() {
    const { createApp } = require("../src/app");
    return createApp({ currentUser: TEST_ADMIN, csrf: false });
}

module.exports = { TEST_ADMIN, createAdminApp };
