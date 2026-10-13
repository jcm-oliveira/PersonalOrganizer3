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

    function init() {
        onModalShow("rescheduleModal", (form, button) => {
            const currentDate = button.getAttribute("data-next-date") || "";
            form.querySelector('[data-field="current-date"]').textContent =
                formatDateBr(currentDate);
            form.querySelector('[name="next_activity_date"]').value = currentDate;
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
