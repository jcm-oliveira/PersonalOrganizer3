// Aplica as cores da Esfera da Vida a partir de atributos data-*.
// A CSP (helmet) bloqueia atributos style="" inline; alterar estilos via JavaScript é permitido.
(function () {
    const HEX_COLOR = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

    // Texto escuro ou branco, o que tiver melhor contraste sobre a cor de fundo
    function contrastTextColor(hex) {
        let h = hex.slice(1);
        if (h.length === 3) {
            h = h
                .split("")
                .map((c) => c + c)
                .join("");
        }
        const toLinear = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
        const [r, g, b] = [0, 2, 4].map((i) => toLinear(parseInt(h.slice(i, i + 2), 16) / 255));
        return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.179 ? "#212529" : "#ffffff";
    }

    function applySphereColors(root) {
        root.querySelectorAll("[data-bg-color]").forEach((el) => {
            const bgColor = el.getAttribute("data-bg-color");
            const textColor = el.getAttribute("data-text-color");
            if (!HEX_COLOR.test(bgColor)) return;
            const color =
                textColor === "auto"
                    ? contrastTextColor(bgColor)
                    : HEX_COLOR.test(textColor)
                      ? textColor
                      : null;
            // Linha de tabela (consulta em cartões): pinta as células, não a <tr>, para
            // os cantos arredondados das células não ficarem com fundo quadrado atrás
            const targets = el.tagName === "TR" ? [...el.cells] : [el];
            targets.forEach((target) => {
                target.style.backgroundColor = bgColor;
                if (color) target.style.color = color;
            });
        });
        // Listas compactas da consulta: a esfera aparece como faixa colorida à esquerda
        root.querySelectorAll("[data-sphere-color]").forEach((el) => {
            const color = el.getAttribute("data-sphere-color");
            if (HEX_COLOR.test(color)) el.style.borderLeftColor = color;
        });
    }

    // Disponível para conteúdo carregado depois (ex.: pop-up de visualização)
    window.applySphereColors = applySphereColors;

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", () => applySphereColors(document));
    } else {
        applySphereColors(document);
    }
})();
