// Aplica as cores da Esfera da Vida a partir de atributos data-*.
// A CSP (helmet) bloqueia atributos style="" inline; alterar estilos via JavaScript é permitido.
(function () {
    const HEX_COLOR = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

    function applySphereColors(root) {
        root.querySelectorAll("[data-bg-color]").forEach((el) => {
            const bgColor = el.getAttribute("data-bg-color");
            const textColor = el.getAttribute("data-text-color");
            if (HEX_COLOR.test(bgColor)) el.style.backgroundColor = bgColor;
            if (HEX_COLOR.test(textColor)) el.style.color = textColor;
        });
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", () => applySphereColors(document));
    } else {
        applySphereColors(document);
    }
})();
