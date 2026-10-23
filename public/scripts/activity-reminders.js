// Notificação com antecedência: pop-up avisando quanto falta para as próximas atividades,
// conforme a antecedência configurada em cada uma (15 minutos a 5 dias).
// Os avisos são buscados uma vez por página carregada e agendados no navegador. Não há
// consulta periódica ao servidor, para não renovar a sessão indefinidamente.
// O pop-up fica aberto até a hora da atividade (clique fora ou Esc não fecham) e cada
// aviso some sozinho 5 min após o início. Avisos próximos aparecem juntos, ordenados
// pela hora de início; cada um pode ser dispensado sozinho ("Dispensar") ou todos de uma
// vez. Um aviso dispensado não volta a aparecer neste navegador (localStorage); sem
// dispensar, reaparece ao trocar de página.
// "Notificar novamente em": grava na atividade uma nova antecedência (menor que o tempo
// que falta) e reagenda o aviso para início - nova antecedência.
(function () {
    const STORAGE_KEY = "activityRemindersDismissed";
    const MAX_TIMEOUT_MS = 2147483647; // limite do setTimeout (~24,8 dias)
    const REFRESH_MS = 30 * 1000;
    const CLOSE_AFTER_START_MS = 5 * 60 * 1000; // o aviso some 5 min após o início

    const script = document.currentScript;
    const url = script && script.dataset.url;
    const canUpdate = Boolean(script) && script.dataset.canUpdate === "true";
    if (!url || !window.fetch || !window.jQuery || !window.jQuery.fn.modal) return;

    let modal = null;
    let list = null;
    let footerButton = null;
    let refreshTimer = null;
    let options = [];
    // Avisos exibidos, na mesma ordem da lista (hora de início)
    const active = [];

    // Estado do pop-up. O Bootstrap ignora "show"/"hide" durante a animação, então:
    // aviso que chega enquanto o pop-up fecha espera em "pending" e o reabre ao final;
    // pedido de fechar durante a abertura é atendido quando a abertura termina.
    let modalState = "hidden"; // hidden | showing | shown | hiding
    let closeWhenShown = false;
    const pending = [];

    // "YYYY-MM-DDTHH:MM:SS" no horário local do navegador
    function parseLocal(iso) {
        const [datePart, timePart] = iso.split("T");
        const [y, m, d] = datePart.split("-").map(Number);
        const [hh, mm, ss] = timePart.split(":").map(Number);
        return new Date(y, m - 1, d, hh, mm, ss || 0);
    }

    function keyOf(reminder) {
        return `${reminder.id}|${reminder.start}|${reminder.notifyBeforeMinutes}`;
    }

    function loadDismissed() {
        try {
            const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
            return value && typeof value === "object" ? value : {};
        } catch {
            return {};
        }
    }

    // Guarda os avisos dispensados; descarta os de atividades que já começaram
    function saveDismissed(keys) {
        const now = Date.now();
        const dismissed = loadDismissed();
        keys.forEach((key) => {
            dismissed[key] = parseLocal(key.split("|")[1]).getTime();
        });
        Object.keys(dismissed).forEach((key) => {
            if (!(dismissed[key] > now)) delete dismissed[key];
        });
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(dismissed));
        } catch {
            // armazenamento indisponível: o aviso pode reaparecer em outra página
        }
    }

    const pad = (n) => String(n).padStart(2, "0");

    function formatRemaining(ms) {
        if (ms <= 0) {
            const elapsed = Math.floor(-ms / 60000);
            return elapsed < 1 ? "começando agora" : `começou há ${elapsed} min`;
        }
        const total = Math.ceil(ms / 60000);
        const days = Math.floor(total / 1440);
        const hours = Math.floor((total % 1440) / 60);
        const minutes = total % 60;
        const parts = [];
        if (days) parts.push(`${days} ${days === 1 ? "dia" : "dias"}`);
        if (hours) parts.push(`${hours} h`);
        if (minutes && !days) parts.push(`${minutes} min`);
        return `faltam ${parts.join(" e ") || "menos de 1 min"}`;
    }

    function formatStart(reminder, start) {
        const date = `${pad(start.getDate())}/${pad(start.getMonth() + 1)}`;
        return reminder.allDay
            ? `${date} (dia inteiro)`
            : `${date} às ${pad(start.getHours())}:${pad(start.getMinutes())}`;
    }

    // 0 -> "Na hora da atividade" | 30 -> "30 minutos antes"
    function labelOf(minutes) {
        const option = options.find((opt) => opt.minutes === minutes);
        if (minutes === 0) return option ? option.label : "Na hora da atividade";
        return `${option ? option.label : `${minutes} minutos`} antes`;
    }

    function openModal() {
        closeWhenShown = false;
        if (modalState === "hidden") window.jQuery(modal).modal("show");
    }

    function closeModal() {
        if (modalState === "shown") window.jQuery(modal).modal("hide");
        else if (modalState === "showing") closeWhenShown = true;
    }

    function ensureModal() {
        if (modal) return;
        const wrapper = document.createElement("div");
        // Clique fora ou Esc não fecham: o aviso fica aberto até a hora da atividade
        // (fecha pelos botões de dispensar / "×" ou sozinho, 5 min após o início)
        wrapper.innerHTML = `
            <div class="modal fade" id="activityReminderModal" tabindex="-1" role="dialog"
                aria-labelledby="activityReminderTitle" aria-hidden="true"
                data-backdrop="static" data-keyboard="false">
                <div class="modal-dialog" role="document">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title" id="activityReminderTitle">
                                <i class="far fa-bell text-warning mr-2" aria-hidden="true"></i>Lembrete de atividade
                            </h5>
                            <button type="button" class="close" data-dismiss="modal" aria-label="Fechar">
                                <span aria-hidden="true">&times;</span>
                            </button>
                        </div>
                        <div class="modal-body">
                            <ul class="activity-reminder-list list-unstyled mb-0"></ul>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-primary" data-dismiss="modal">OK, entendi</button>
                        </div>
                    </div>
                </div>
            </div>`;
        modal = wrapper.firstElementChild;
        list = modal.querySelector(".activity-reminder-list");
        footerButton = modal.querySelector(".modal-footer .btn");
        document.body.appendChild(modal);

        const $modal = window.jQuery(modal);
        $modal.on("show.bs.modal", () => {
            modalState = "showing";
        });
        $modal.on("shown.bs.modal", () => {
            modalState = "shown";
            if (closeWhenShown && active.length === 0) closeModal();
            closeWhenShown = false;
        });
        $modal.on("hide.bs.modal", () => {
            modalState = "hiding";
        });
        // Fechado (botões ou automático): os avisos que restaram contam como dispensados;
        // os reagendados já têm novo aviso. Avisos que chegaram durante o fechamento
        // reabrem o pop-up.
        $modal.on("hidden.bs.modal", () => {
            modalState = "hidden";
            saveDismissed(active.filter((r) => !r.snoozed).map(keyOf));
            active.forEach((r) => clearTimeout(r.expireTimer));
            active.length = 0;
            list.textContent = "";
            clearInterval(refreshTimer);
            refreshTimer = null;
            pending.splice(0).forEach(show);
        });
    }

    // "OK, entendi" com um aviso; "Dispensar todos" com mais de um
    function updateFooter() {
        footerButton.textContent = active.length > 1 ? "Dispensar todos" : "OK, entendi";
    }

    function updateWhen(reminder) {
        const start = parseLocal(reminder.start);
        const remaining = start.getTime() - Date.now();
        reminder.whenEl.textContent = `${formatStart(reminder, start)} · ${formatRemaining(
            remaining,
        )}`;
        // Depois do início não há mais o que reagendar
        if (remaining <= 0 && reminder.snoozeEl && !reminder.snoozed) {
            reminder.snoozeEl.remove();
            reminder.snoozeEl = null;
        }
    }

    // Tira um aviso da lista; sem avisos, o pop-up fecha (exceto na troca por um
    // aviso reagendado da mesma atividade: keepOpen)
    function removeReminder(reminder, { dismissed, keepOpen = false }) {
        const index = active.indexOf(reminder);
        if (index < 0) return;
        if (dismissed && !reminder.snoozed) saveDismissed([keyOf(reminder)]);
        clearTimeout(reminder.expireTimer);
        reminder.itemEl.remove();
        active.splice(index, 1);
        updateFooter();
        if (active.length === 0 && !keepOpen) closeModal();
    }

    // Opções menores que o tempo que falta (as demais disparariam o aviso na hora)
    function buildSnoozeField(reminder) {
        const remaining = parseLocal(reminder.start).getTime() - Date.now();
        const available = options.filter((opt) => opt.minutes * 60 * 1000 < remaining);
        if (available.length === 0) return null;

        const fieldId = `activityReminderSnooze-${reminder.id}`;
        const field = document.createElement("div");
        field.className = "activity-reminder__snooze form-inline";

        const label = document.createElement("label");
        label.className = "mr-2 mb-0";
        label.htmlFor = fieldId;
        label.textContent = "Notificar novamente em:";

        const select = document.createElement("select");
        select.className = "form-control form-control-sm";
        select.id = fieldId;
        select.add(new Option("Selecione...", ""));
        available.forEach((opt) => select.add(new Option(labelOf(opt.minutes), opt.minutes)));

        const status = document.createElement("div");
        status.className = "activity-reminder__status small w-100 mt-1";
        status.setAttribute("aria-live", "polite");

        select.addEventListener("change", () => {
            if (select.value) snooze(reminder, Number(select.value), select, status);
        });

        field.append(label, select, status);
        return field;
    }

    async function snooze(reminder, minutes, select, status) {
        select.disabled = true;
        status.className = "activity-reminder__status small w-100 mt-1 text-muted";
        status.textContent = "Salvando...";
        try {
            const response = await fetch(`${url}/${reminder.id}`, {
                method: "POST",
                credentials: "same-origin",
                headers: {
                    "Content-Type": "application/json",
                    Accept: "application/json",
                    // Token CSRF da sessão (meta "csrf-token" em parts/head.ejs)
                    "X-CSRF-Token":
                        document
                            .querySelector('meta[name="csrf-token"]')
                            ?.getAttribute("content") || "",
                },
                body: JSON.stringify({ notify_before_minutes: minutes }),
            });
            if (!response.ok) throw new Error(String(response.status));

            // O aviso atual não volta; o novo é agendado com a nova antecedência
            saveDismissed([keyOf(reminder)]);
            reminder.snoozed = true;
            schedule([{ ...reminder, notifyBeforeMinutes: minutes }]);
            status.className = "activity-reminder__status small w-100 mt-1 text-success";
            status.textContent =
                minutes === 0
                    ? "Você será notificado novamente na hora da atividade."
                    : `Você será notificado novamente ${labelOf(minutes)} do início.`;
        } catch {
            select.disabled = false;
            select.value = "";
            status.className = "activity-reminder__status small w-100 mt-1 text-danger";
            status.textContent = "Não foi possível reagendar. Tente novamente.";
        }
    }

    // Itens montados com textContent: o título vem do cadastro e não é tratado como HTML
    function buildItem(reminder) {
        const item = document.createElement("li");
        item.className = "activity-reminder";

        const header = document.createElement("div");
        header.className = "activity-reminder__header";

        const title = document.createElement("a");
        title.className = "activity-reminder__title";
        title.href = reminder.url;
        title.textContent = reminder.title;

        const dismissButton = document.createElement("button");
        dismissButton.type = "button";
        dismissButton.className = "btn btn-link btn-sm activity-reminder__dismiss";
        dismissButton.textContent = "Dispensar";
        dismissButton.setAttribute("aria-label", `Dispensar o aviso de ${reminder.title}`);
        dismissButton.addEventListener("click", () =>
            removeReminder(reminder, { dismissed: true }),
        );

        header.append(title, dismissButton);

        reminder.whenEl = document.createElement("div");
        reminder.whenEl.className = "activity-reminder__when";

        item.append(header, reminder.whenEl);
        reminder.snoozeEl = canUpdate ? buildSnoozeField(reminder) : null;
        if (reminder.snoozeEl) item.appendChild(reminder.snoozeEl);
        updateWhen(reminder);
        return item;
    }

    // Insere na lista pela hora de início (empate: título)
    function insertSorted(reminder) {
        const index = active.findIndex(
            (r) =>
                r.start > reminder.start ||
                (r.start === reminder.start && r.title.localeCompare(reminder.title, "pt-BR") > 0),
        );
        if (index < 0) {
            active.push(reminder);
            list.appendChild(reminder.itemEl);
        } else {
            list.insertBefore(reminder.itemEl, active[index].itemEl);
            active.splice(index, 0, reminder);
        }
    }

    function show(data) {
        if (loadDismissed()[keyOf(data)]) return; // dispensado em outra aba
        ensureModal();
        // Pop-up fechando: espera terminar e reabre com este aviso
        if (modalState === "hiding") {
            if (!pending.some((r) => keyOf(r) === keyOf(data))) pending.push(data);
            return;
        }
        if (active.some((r) => keyOf(r) === keyOf(data))) return;

        // Novo aviso da mesma atividade (reagendado) substitui o anterior na lista
        const previous = active.find((r) => r.id === data.id);
        if (previous) removeReminder(previous, { dismissed: false, keepOpen: true });

        const reminder = { ...data, snoozed: false };
        reminder.itemEl = buildItem(reminder);
        insertSorted(reminder);
        updateFooter();
        reminder.expireTimer = setTimeout(
            () => removeReminder(reminder, { dismissed: true }),
            Math.max(0, parseLocal(reminder.start).getTime() + CLOSE_AFTER_START_MS - Date.now()),
        );

        if (!refreshTimer) {
            refreshTimer = setInterval(() => active.forEach(updateWhen), REFRESH_MS);
        }
        openModal();
    }

    function schedule(reminders) {
        const now = Date.now();
        const dismissed = loadDismissed();
        reminders.forEach((reminder) => {
            const start = parseLocal(reminder.start).getTime();
            const notifyAt = start - reminder.notifyBeforeMinutes * 60 * 1000;
            // Dispensado pelo usuário ou já passados 5 min do início: não mostra
            if (dismissed[keyOf(reminder)] || now >= start + CLOSE_AFTER_START_MS) return;
            const delay = notifyAt - now;
            if (delay <= 0) show(reminder);
            else if (delay < MAX_TIMEOUT_MS) setTimeout(() => show(reminder), delay);
        });
    }

    fetch(url, { headers: { Accept: "application/json" }, credentials: "same-origin" })
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
            if (!data || !Array.isArray(data.reminders)) return;
            options = Array.isArray(data.options) ? data.options : [];
            schedule(data.reminders);
        })
        .catch(() => {
            // sem avisos se a busca falhar
        });
})();
