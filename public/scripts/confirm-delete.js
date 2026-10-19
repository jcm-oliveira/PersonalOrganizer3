// Preenche o pop-up de confirmação de exclusão com a ação e o nome do registro
// (data-delete-action / data-delete-name do botão). Script externo: a CSP bloqueia inline.
(function () {
    function init() {
        const modal = document.getElementById("confirmDeleteModal");
        if (!modal || !window.jQuery) return;
        window.jQuery(modal).on("show.bs.modal", (event) => {
            const button = event.relatedTarget;
            if (!button) return;
            const action = button.getAttribute("data-delete-action") || "";
            // Só ações internas de exclusão
            if (!/^\/[\w-]+-D\/\d+$/.test(action)) return;
            modal.querySelector("form").setAttribute("action", action);
            modal.querySelector('[data-field="delete-name"]').textContent =
                button.getAttribute("data-delete-name") || "";
        });
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }
})();
