// Abre a visualização da atividade em pop-up (Bootstrap modal), carregando o fragmento
// /cms-Activity-V/:id/detalhes. Links com data-activity-view="<id>" abrem o pop-up num
// clique normal; Ctrl/Shift/botão do meio continuam abrindo a página em nova aba.
// Também exposto como window.ActivityViewModal.open(id) (usado pelo calendário).
(function () {
    let modal;
    let requestSeq = 0;

    function field(name) {
        return modal.querySelector(`[data-field="${name}"]`);
    }

    function showMessage(text) {
        const body = field("body");
        body.textContent = "";
        const p = document.createElement("p");
        p.className = "text-center text-muted py-5 mb-0";
        p.textContent = text;
        body.appendChild(p);
    }

    async function open(id) {
        if (!modal || !window.jQuery) {
            window.location.href = `/cms-Activity-V/${encodeURIComponent(id)}`;
            return;
        }
        const seq = ++requestSeq;
        field("title").textContent = `Atividade nº ${id}`;
        field("edit-link").setAttribute("href", `/cms-Activity-U/${encodeURIComponent(id)}`);
        showMessage("Carregando...");
        window.jQuery(modal).modal("show");

        try {
            const response = await fetch(`/cms-Activity-V/${encodeURIComponent(id)}/detalhes`, {
                headers: { Accept: "text/html" },
            });
            if (seq !== requestSeq) return; // outro pop-up foi aberto nesse meio-tempo
            if (!response.ok) {
                showMessage(
                    response.status === 404
                        ? "Atividade não encontrada."
                        : "Não foi possível carregar a atividade.",
                );
                return;
            }
            // HTML gerado pelo servidor com os valores escapados pelo EJS
            field("body").innerHTML = await response.text();
            if (window.applySphereColors) window.applySphereColors(field("body"));
        } catch {
            if (seq === requestSeq) showMessage("Não foi possível carregar a atividade.");
        }
    }

    function init() {
        modal = document.getElementById("activityViewModal");
        if (!modal) return;

        document.addEventListener("click", (event) => {
            const link = event.target.closest("[data-activity-view]");
            if (!link) return;
            // Mantém o comportamento padrão para abrir em nova aba/janela
            if (
                event.button !== 0 ||
                event.ctrlKey ||
                event.metaKey ||
                event.shiftKey ||
                event.altKey
            ) {
                return;
            }
            event.preventDefault();
            open(link.getAttribute("data-activity-view"));
        });
    }

    window.ActivityViewModal = { open: (id) => open(id) };

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }
})();
