// Matriz de permissões do perfil de acesso:
// - marcar Inserir/Alterar/Excluir marca Visualizar; desmarcar Visualizar desmarca o resto da linha;
// - atalhos "Só visualizar tudo", "Marcar tudo" e "Limpar".
// O servidor aplica as mesmas regras (src/security/permissions.js).
(function () {
    function init() {
        const matrix = document.getElementById("permMatrix");
        if (!matrix) return;

        matrix.addEventListener("change", (event) => {
            const input = event.target;
            if (!input.matches('input[name="perm"]')) return;
            const row = input.closest("[data-perm-row]");
            const view = row.querySelector('input[data-action="view"]');
            if (input.dataset.action === "view" && !input.checked) {
                row.querySelectorAll('input[name="perm"]').forEach((cb) => {
                    cb.checked = false;
                });
            } else if (input.checked && view) {
                view.checked = true;
            }
        });

        document.querySelectorAll("[data-perm-bulk]").forEach((button) => {
            button.addEventListener("click", () => {
                const mode = button.dataset.permBulk;
                matrix.querySelectorAll('input[name="perm"]').forEach((cb) => {
                    cb.checked =
                        mode === "all" || (mode === "view" && cb.dataset.action === "view");
                });
            });
        });
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }
})();
