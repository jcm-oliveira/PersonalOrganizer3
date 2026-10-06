const Example = require("../model/ExampleModel");
const { HttpError } = require("../errors/HttpError");
const {
    PAGE_SIZES,
    listQuerySchema,
    exampleFormSchema,
    idParamSchema,
    toFieldErrors,
} = require("../validation/exampleSchemas");

const LIST_URL = "/cms-Example-Q";

// Mensagens exibidas após o redirect (padrão PRG), escolhidas pelo parâmetro ?msg=.
const MESSAGES = {
    created: { alertType: "alert-success", text: "Registro inserido com sucesso." },
    updated: { alertType: "alert-success", text: "Registro alterado com sucesso." },
    deleted: { alertType: "alert-warning", text: "Registro excluído com sucesso." },
};

function messageFor(code) {
    return Object.hasOwn(MESSAGES, code) ? MESSAGES[code] : null;
}

function parseId(rawId) {
    const parsed = idParamSchema.safeParse(rawId);
    if (!parsed.success) {
        throw new HttpError(404, "Registro não encontrado.");
    }
    return parsed.data;
}

function listUrl(filter, page) {
    const params = new URLSearchParams({
        status: filter.status,
        search: filter.search,
        perPage: String(filter.perPage),
        page: String(page),
    });
    return `${LIST_URL}?${params}`;
}

module.exports = {
    //------------------------------------------------
    //          SHOW PAGE ROUTINE (Q + F)
    //------------------------------------------------

    async loadShowPage(req, res) {
        const filter = listQuerySchema.parse(req.query);
        const criteria = {
            status: filter.status === "all" ? null : Number(filter.status),
            search: filter.search,
        };

        const total = await Example.countExamples(criteria);
        const totalPages = Math.max(1, Math.ceil(total / filter.perPage));
        const page = Math.min(filter.page, totalPages);
        const offset = (page - 1) * filter.perPage;

        const examples = await Example.selectExamples({
            ...criteria,
            limit: filter.perPage,
            offset,
        });

        return res.render("cms/cms-Example-Q", {
            title: "Exemplos",
            examples,
            filter,
            pageSizes: PAGE_SIZES,
            pagination: {
                page,
                totalPages,
                total,
                firstItem: total === 0 ? 0 : offset + 1,
                lastItem: offset + examples.length,
                previousUrl: page > 1 ? listUrl(filter, page - 1) : null,
                nextUrl: page < totalPages ? listUrl(filter, page + 1) : null,
            },
            message: messageFor(req.query.msg),
        });
    },

    //------------------------------------------------
    //                 INSERT ROUTINE (C)
    //------------------------------------------------

    async loadInsertPage(req, res) {
        return res.render("cms/cms-Example-C", {
            title: "Novo exemplo",
            values: { status: "1" },
            errors: {},
        });
    },

    async insertExamplePage(req, res) {
        const parsed = exampleFormSchema.safeParse(req.body ?? {});
        if (!parsed.success) {
            return res.status(422).render("cms/cms-Example-C", {
                title: "Novo exemplo",
                values: req.body ?? {},
                errors: toFieldErrors(parsed.error),
            });
        }

        await Example.insertExample(parsed.data);
        return res.redirect(303, `${LIST_URL}?msg=created`);
    },

    //------------------------------------------------
    //                 UPDATE ROUTINE (U)
    //------------------------------------------------

    async loadUpdatePage(req, res) {
        const id = parseId(req.params.id);
        const example = await Example.selectExampleById(id);
        if (!example) {
            throw new HttpError(404, "Registro não encontrado.");
        }

        return res.render("cms/cms-Example-U", {
            title: `Editar exemplo nº ${id}`,
            exampleId: id,
            values: {
                name: example.name,
                description: example.description,
                status: String(example.status),
            },
            errors: {},
        });
    },

    async updateExamplePage(req, res) {
        const id = parseId(req.params.id);
        const parsed = exampleFormSchema.safeParse(req.body ?? {});
        if (!parsed.success) {
            return res.status(422).render("cms/cms-Example-U", {
                title: `Editar exemplo nº ${id}`,
                exampleId: id,
                values: req.body ?? {},
                errors: toFieldErrors(parsed.error),
            });
        }

        const affectedRows = await Example.updateExample(id, parsed.data);
        if (affectedRows === 0) {
            throw new HttpError(404, "Registro não encontrado.");
        }
        return res.redirect(303, `${LIST_URL}?msg=updated`);
    },

    //------------------------------------------------
    //                 DELETE ROUTINE (D)
    //------------------------------------------------

    async deleteExamplePage(req, res) {
        const id = parseId(req.params.id);
        const affectedRows = await Example.deleteExample(id);
        if (affectedRows === 0) {
            throw new HttpError(404, "Registro não encontrado.");
        }
        return res.redirect(303, `${LIST_URL}?msg=deleted`);
    },
};
