// Formulário de atividade (inserção e edição). Script externo: a CSP bloqueia scripts inline.
// 1) Destaca a cor da Esfera da Vida selecionada.
// 2) Mostra apenas os campos de Repetição que valem para a frequência escolhida.
(function () {
    const HEX_COLOR = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

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

    function initSphereColor() {
        const sphereSelect = document.getElementById("life_sphere");
        const badge = document.getElementById("life_sphere_badge");
        if (!sphereSelect || !badge) return;

        function update() {
            const selected = sphereSelect.options[sphereSelect.selectedIndex];
            const color = selected ? selected.getAttribute("data-color") : "";
            if (HEX_COLOR.test(color || "")) {
                const textColor = contrastTextColor(color);
                badge.classList.remove("d-none");
                badge.style.backgroundColor = color;
                badge.style.color = textColor;
                badge.textContent = selected.value;
                sphereSelect.style.backgroundColor = color;
                sphereSelect.style.color = textColor;
            } else {
                badge.classList.add("d-none");
                badge.textContent = "";
                sphereSelect.style.backgroundColor = "";
                sphereSelect.style.color = "";
            }
        }

        sphereSelect.addEventListener("change", update);
        update();
    }

    const UNIT_LABELS = {
        DAILY: "dia(s)",
        WEEKLY: "semana(s)",
        MONTHLY: "mês(es)",
        YEARLY: "ano(s)",
    };

    function initRecurrence() {
        const section = document.getElementById("recurrenceSection");
        const freqSelect = document.getElementById("recurrence_freq");
        if (!section || !freqSelect) return;
        const unit = document.getElementById("recurrence_interval_unit");

        function update() {
            const freq = freqSelect.value;
            section.querySelectorAll("[data-recurrence-show]").forEach((el) => {
                const visible = el.getAttribute("data-recurrence-show").split(" ").includes(freq);
                el.classList.toggle("d-none", !visible);
                // Campos ocultos não são enviados (evita validar o que não se aplica)
                el.querySelectorAll("input, select").forEach((field) => {
                    field.disabled = !visible;
                });
            });
            if (unit) unit.textContent = UNIT_LABELS[freq] || "vez(es)";
        }

        freqSelect.addEventListener("change", update);
        update();
    }

    function init() {
        initSphereColor();
        initRecurrence();
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }
})();
