// Testa o módulo de exemplo pela camada HTTP (rota → controller → view),
// substituindo o model por dublês: nenhum banco é necessário.
process.env.NODE_ENV = "test";
process.env.DATABASE_URL = "mysql://test:test@localhost:3306/test";

const { describe, it, afterEach, mock } = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
const Example = require("../src/model/ExampleModel");
const { createApp } = require("../src/app");

const app = createApp();

describe("Módulo Example (CMS)", () => {
    afterEach(() => mock.restoreAll());

    it("lista os registros ativos da primeira página, com escape de HTML", async () => {
        mock.method(Example, "countExamples", async () => 1);
        const select = mock.method(Example, "selectExamples", async () => [
            { id: 7, name: "Primeiro <exemplo>", description: null, status: 1 },
        ]);

        const res = await request(app).get("/cms-Example-Q").expect(200);

        assert.deepEqual(select.mock.calls[0].arguments[0], {
            status: 1,
            search: "",
            limit: 10,
            offset: 0,
        });
        assert.match(res.text, /Primeiro &lt;exemplo&gt;/);
        assert.doesNotMatch(res.text, /Primeiro <exemplo>/);
    });

    it("insere um registro válido e redireciona para a lista (PRG)", async () => {
        const insert = mock.method(Example, "insertExample", async () => 42);

        const res = await request(app)
            .post("/cms-Example-C")
            .type("form")
            .send({ name: "  Novo registro  ", description: "", status: "1" })
            .expect(303);

        assert.equal(res.headers.location, "/cms-Example-Q?msg=created");
        assert.deepEqual(insert.mock.calls[0].arguments[0], {
            name: "Novo registro",
            description: null,
            status: 1,
        });
    });

    it("rejeita um registro sem nome e não chama o model", async () => {
        const insert = mock.method(Example, "insertExample", async () => 1);

        const res = await request(app)
            .post("/cms-Example-C")
            .type("form")
            .send({ name: "   ", status: "1" })
            .expect(422);

        assert.equal(insert.mock.callCount(), 0);
        assert.match(res.text, /Informe o nome\./);
    });

    it("responde 404 para um registro inexistente", async () => {
        mock.method(Example, "selectExampleById", async () => null);

        await request(app).get("/cms-Example-C/999").expect(404);
        await request(app).get("/cms-Example-C/abc").expect(404);
    });

    it("responde 500 sem expor detalhes quando o banco falha", async () => {
        mock.method(console, "error", () => {});
        mock.method(Example, "countExamples", async () => {
            throw new Error("connect ECONNREFUSED detalhe-interno");
        });

        const res = await request(app).get("/cms-Example-Q").expect(500);

        assert.doesNotMatch(res.text, /detalhe-interno/);
        assert.match(res.text, /Ocorreu um erro inesperado/);
    });
});
