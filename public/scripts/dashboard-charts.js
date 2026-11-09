// Aplica o tamanho das barras (gráficos do Dashboard e barras de evolução dos Estudos)
// a partir de data-bar-width (largura, 0 a 100) e data-bar-height (altura, 0 a 100).
// A CSP bloqueia atributos style="" inline; alterar estilos via JavaScript é permitido.
(function () {
    function applySize(selector, attribute, property) {
        document.querySelectorAll(selector).forEach((bar) => {
            const value = Number(bar.getAttribute(attribute));
            if (Number.isFinite(value) && value >= 0 && value <= 100) {
                bar.style[property] = `${value}%`;
            }
        });
    }

    function applyBarSizes() {
        applySize("[data-bar-width]", "data-bar-width", "width");
        applySize("[data-bar-height]", "data-bar-height", "height");
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", applyBarSizes);
    } else {
        applyBarSizes();
    }
})();
