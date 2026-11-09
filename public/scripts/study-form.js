// Formulário de Estudo: sincroniza o controle deslizante com o campo de evolução,
// mostra a duração calculada pelas datas e lista os arquivos escolhidos para anexar.
// A validação definitiva (tipos, tamanhos, datas) é feita no servidor.
(function () {
    const DAY_MS = 24 * 60 * 60 * 1000;

    function parseDate(value) {
        const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value || "");
        return match ? Date.UTC(match[1], match[2] - 1, match[3]) : null;
    }

    function todayUtc() {
        const now = new Date();
        return Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
    }

    function durationLabel(startValue, endValue) {
        const start = parseDate(startValue);
        if (start === null) return "-";
        const end = parseDate(endValue) ?? todayUtc();
        if (end < start) return "Término anterior ao início";
        const days = Math.round((end - start) / DAY_MS);
        const suffix = parseDate(endValue) === null ? " (até hoje)" : "";
        if (days < 60) return `${days} ${days === 1 ? "dia" : "dias"}${suffix}`;
        const months = Math.round(days / 30.4);
        if (months < 24) return `≈ ${months} meses${suffix}`;
        return `≈ ${(days / 365).toFixed(1).replace(".", ",")} anos${suffix}`;
    }

    function formatBytes(bytes) {
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
        return `${(bytes / 1024 / 1024).toFixed(1).replace(".", ",")} MB`;
    }

    function initProgress() {
        const range = document.getElementById("progressRange");
        const input = document.getElementById("progress");
        const output = document.getElementById("progressOutput");
        if (!range || !input || !output) return;

        const clamp = (value) => Math.min(100, Math.max(0, Math.round(Number(value) || 0)));
        range.addEventListener("input", () => {
            input.value = range.value;
            output.textContent = `${range.value}%`;
        });
        input.addEventListener("input", () => {
            const value = clamp(input.value);
            range.value = String(value);
            output.textContent = `${value}%`;
        });
    }

    function initDuration() {
        const start = document.getElementById("start_date");
        const end = document.getElementById("end_date");
        const preview = document.getElementById("durationPreview");
        if (!start || !end || !preview) return;
        const update = () => {
            preview.textContent = durationLabel(start.value, end.value);
        };
        start.addEventListener("change", update);
        end.addEventListener("change", update);
        update();
    }

    function initAttachments() {
        const input = document.getElementById("attachments");
        const list = document.getElementById("attachmentsSelected");
        if (!input || !list) return;
        const maxBytes = Number(input.getAttribute("data-max-bytes")) || Infinity;
        const maxFiles = Number(input.getAttribute("data-max-files")) || Infinity;

        input.addEventListener("change", () => {
            list.textContent = "";
            const files = Array.from(input.files || []);
            if (files.length > maxFiles) {
                const li = document.createElement("li");
                li.className = "text-danger";
                li.textContent = `Selecione no máximo ${maxFiles} arquivos por vez.`;
                list.appendChild(li);
            }
            files.forEach((file) => {
                const li = document.createElement("li");
                const tooBig = file.size > maxBytes;
                li.className = tooBig ? "text-danger" : "text-dark";
                const icon = document.createElement("i");
                icon.className = `fas ${tooBig ? "fa-exclamation-triangle" : "fa-file"} mr-1`;
                icon.setAttribute("aria-hidden", "true");
                li.appendChild(icon);
                li.appendChild(
                    document.createTextNode(
                        `${file.name} (${formatBytes(file.size)})${tooBig ? " - acima do limite" : ""}`,
                    ),
                );
                list.appendChild(li);
            });
        });
    }

    function init() {
        initProgress();
        initDuration();
        initAttachments();
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }
})();
