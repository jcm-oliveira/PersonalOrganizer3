// Aplica a largura das barras dos gráficos do Dashboard a partir de data-bar-width (0 a 100).
// A CSP bloqueia atributos style="" inline; alterar estilos via JavaScript é permitido.
(function () {
    function applyBarWidths() {
        document.querySelectorAll(".hbar-bar[data-bar-width]").forEach((bar) => {
            const width = Number(bar.getAttribute("data-bar-width"));
            if (Number.isFinite(width) && width >= 0 && width <= 100) {
                bar.style.width = `${width}%`;
            }
        });
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", applyBarWidths);
    } else {
        applyBarWidths();
    }
})();
