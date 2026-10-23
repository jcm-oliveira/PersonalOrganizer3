// Preenche os pop-ups "Remarcar atividade" e "Status da atividade" da consulta de atividades
// com os dados do botão clicado (data-*). Script externo: a CSP bloqueia scripts inline.
(function () {
    function fillCommonFields(form, button) {
        const id = button.getAttribute("data-activity-id");
        form.setAttribute("action", form.getAttribute("data-action-prefix") + id);
        form.querySelector('[data-field="activity-id"]').textContent = id;
        form.querySelector('[data-field="activity-description"]').textContent =
            button.getAttribute("data-activity-description") || "";
    }

    function formatDateBr(isoDate) {
        const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate || "");
        return match ? `${match[3]}/${match[2]}/${match[1]}` : "-";
    }

    function onModalShow(modalId, fill) {
        const modal = document.getElementById(modalId);
        if (!modal || !window.jQuery) return;
        window.jQuery(modal).on("show.bs.modal", (event) => {
            const button = event.relatedTarget;
            if (!button) return;
            const form = modal.querySelector("form");
            fillCommonFields(form, button);
            fill(form, button);
        });
        window.jQuery(modal).on("shown.bs.modal", () => {
            const field = modal.querySelector("input[type=date], select");
            if (field) field.focus();
        });
    }

    // Farol: a atividade de hoje com horário vira ATRASADO 5 min após o início (quando o
    // pop-up de aviso some), sem recarregar a página. data-overdue-at vem do servidor.
    const MAX_TIMEOUT_MS = 2147483647;

    function markOverdue(row) {
        const badge = row.querySelector(".c-dayprox .badge");
        if (badge) {
            badge.className = "badge badge-danger";
            badge.textContent = "ATRASADO";
        }
        const dot = row.querySelector(".c-days-next .rounded-circle");
        if (dot) dot.style.backgroundColor = "#343a40";
        // Sem a cor da Esfera da Vida, a linha atrasada fica vermelha (igual ao servidor)
        if (!row.classList.contains("activity-row--sphere")) row.classList.add("table-danger");
    }

    function scheduleOverdue() {
        document.querySelectorAll("tr[data-overdue-at]").forEach((row) => {
            const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})$/.exec(
                row.getAttribute("data-overdue-at"),
            );
            if (!match) return;
            const [, y, mo, d, h, mi, s] = match.map(Number);
            const delay = new Date(y, mo - 1, d, h, mi, s).getTime() - Date.now();
            if (delay <= 0) markOverdue(row);
            else if (delay < MAX_TIMEOUT_MS) setTimeout(() => markOverdue(row), delay);
        });
    }

    function init() {
        scheduleOverdue();

        onModalShow("rescheduleModal", (form, button) => {
            const currentDate = button.getAttribute("data-next-date") || "";
            form.querySelector('[data-field="current-date"]').textContent =
                formatDateBr(currentDate);
            form.querySelector('[name="next_activity_date"]').value = currentDate;
        });

        onModalShow("occurrenceModal", (form, button) => {
            const nextOccurrence = button.getAttribute("data-next-occurrence") || "";
            form.querySelector('[data-field="recurrence"]').textContent =
                button.getAttribute("data-recurrence") || "";
            form.querySelector('[data-field="current-date"]').textContent = formatDateBr(
                button.getAttribute("data-next-date"),
            );
            form.querySelector('[data-field="next-occurrence"]').textContent = nextOccurrence
                ? formatDateBr(nextOccurrence)
                : "Nenhuma — esta é a última ocorrência";
        });

        onModalShow("statusModal", (form, button) => {
            form.querySelector('[name="status"]').value = button.getAttribute("data-status") || "";
        });
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }
})();
