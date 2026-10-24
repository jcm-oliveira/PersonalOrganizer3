// Formulário de atividade (inserção e edição). Script externo: a CSP bloqueia scripts inline.
// 1) Mostra a cor da Esfera da Vida selecionada num quadradinho discreto dentro do campo.
// 2) Mostra apenas os campos de Repetição que valem para a frequência escolhida.
(function () {
    const HEX_COLOR = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

    function initSphereColor() {
        const sphereSelect = document.getElementById("life_sphere");
        const swatch = document.getElementById("life_sphere_swatch");
        if (!sphereSelect || !swatch) return;
        const wrapper = swatch.parentElement;

        function update() {
            const selected = sphereSelect.options[sphereSelect.selectedIndex];
            const color = selected ? selected.getAttribute("data-color") : "";
            const hasColor = HEX_COLOR.test(color || "");
            swatch.style.backgroundColor = hasColor ? color : "";
            wrapper.classList.toggle("sphere-select--colored", hasColor);
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
