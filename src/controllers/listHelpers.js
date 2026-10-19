// Paginação e mensagens das telas de consulta de Usuários e Perfis de Acesso.

function buildPagination({ page, perPage, total, baseUrl, queryParams }) {
    const totalPages = Math.max(1, Math.ceil(total / perPage));
    const current = Math.min(page, totalPages);
    const offset = (current - 1) * perPage;
    const urlFor = (p) => {
        const params = new URLSearchParams();
        Object.entries({ ...queryParams, page: p }).forEach(([key, value]) => {
            if (value !== undefined && value !== null && value !== "")
                params.set(key, String(value));
        });
        return `${baseUrl}?${params}`;
    };
    return {
        page: current,
        totalPages,
        total,
        offset,
        firstItem: total === 0 ? 0 : offset + 1,
        previousUrl: current > 1 ? urlFor(current - 1) : null,
        nextUrl: current < totalPages ? urlFor(current + 1) : null,
    };
}

function messageFrom(messages, code) {
    return Object.hasOwn(messages, code) ? messages[code] : null;
}

module.exports = { buildPagination, messageFrom };
