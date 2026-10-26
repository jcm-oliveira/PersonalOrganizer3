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

    // row: linha da tabela de Programadas (os blocos da direita não têm data nem farol)
    function markOverdue(row) {
        const badge = row.querySelector(".c-dayprox .badge");
        if (badge) {
            badge.className = "badge badge-danger";
            badge.textContent = "ATRASADO";
        }
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

    // Setas dos blocos OS e Compras: grava a nova sequência e troca os itens na tela, sem
    // recarregar (mantém a rolagem do bloco). Se a vizinha estiver em outra página, ou se
    // algo falhar, recarrega a consulta.
    function updateMoveButtons(list) {
        const items = [...list.querySelectorAll(":scope > li")];
        items.forEach((item, index) => {
            const up = item.querySelector('[data-move="up"]');
            const down = item.querySelector('[data-move="down"]');
            if (up) up.disabled = index === 0 && list.dataset.firstPage === "true";
            if (down) {
                down.disabled = index === items.length - 1 && list.dataset.lastPage === "true";
            }
        });
    }

    function initMoveButtons() {
        document.querySelectorAll("form[data-activity-move]").forEach((form) => {
            form.addEventListener("submit", async (event) => {
                event.preventDefault();
                const direction = event.submitter?.value;
                if (direction !== "up" && direction !== "down") return;

                const item = form.closest("li");
                const list = item.parentElement;
                const neighbor =
                    direction === "up" ? item.previousElementSibling : item.nextElementSibling;
                const body = new URLSearchParams(new FormData(form));
                body.set("direction", direction);
                form.querySelectorAll("button").forEach((b) => (b.disabled = true));

                try {
                    const response = await fetch(form.action, {
                        method: "POST",
                        credentials: "same-origin",
                        headers: { Accept: "application/json" },
                        body,
                    });
                    const result = response.ok ? await response.json() : null;
                    if (!result || !result.ok) throw new Error("falha ao mover");
                    if (!result.moved) return updateMoveButtons(list);
                    if (!neighbor) return window.location.reload(); // vizinha em outra página

                    if (direction === "up") list.insertBefore(item, neighbor);
                    else list.insertBefore(neighbor, item);
                    updateMoveButtons(list);
                    // Foco no botão "⋮" do item movido, para mover de novo pelo teclado
                    item.querySelector(".row-menu__toggle")?.focus();
                } catch {
                    window.location.reload();
                }
            });
        });
    }

    function init() {
        scheduleOverdue();
        initMoveButtons();

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
