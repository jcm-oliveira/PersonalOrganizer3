// Calendário de atividades com FullCalendar 5 (visões mensal, semanal e lista).
// Script externo: a CSP bloqueia scripts inline. Usa o tema Bootstrap com ícones
// Font Awesome, pois o tema padrão usa uma fonte embutida (data:) bloqueada pela CSP.
(function () {
    const VIEW_STORAGE_KEY = "activityCalendar.view";
    const STATUS_STORAGE_KEY = "activityCalendar.status";
    const MS_PER_DAY = 24 * 60 * 60 * 1000;

    function readStorage(key) {
        try {
            return window.localStorage.getItem(key);
        } catch {
            return null;
        }
    }

    function writeStorage(key, value) {
        try {
            window.localStorage.setItem(key, value);
        } catch {
            // Armazenamento indisponível (ex.: navegação privada): apenas não lembra a escolha.
        }
    }

    const pad = (n) => String(n).padStart(2, "0");

    // Datas no horário LOCAL (toISOString converteria para UTC e mudaria o dia)
    function toDateString(date) {
        return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
    }

    function toTimeString(date) {
        return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
    }

    function formatDateBr(date) {
        return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}`;
    }

    // Distância em dias corridos entre hoje e a data (mesma contagem das atividades)
    function daysFromToday(date) {
        const today = new Date();
        const todayUtc = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
        const dateUtc = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
        return Math.round((dateUtc - todayUtc) / MS_PER_DAY);
    }

    function relativeDayLabel(days) {
        if (days === 0) return "Hoje";
        if (days === 1) return "Amanhã";
        if (days === -1) return "Ontem";
        return days > 0 ? `em ${days} dias` : `há ${-days} dias`;
    }

    // Versão curta para colunas estreitas (celular, visão semanal)
    function relativeDayShortLabel(days) {
        if (days === 0) return "Hoje";
        if (days === 1) return "Amanhã";
        if (days === -1) return "Ontem";
        return days > 0 ? `+${days}d` : `−${-days}d`;
    }

    // Celular / tablet em pé: mesmo ponto de quebra da consulta de atividades
    const MOBILE_QUERY = window.matchMedia("(max-width: 767.98px)");

    // Opções que mudam com o tamanho da tela (chamado ao trocar de visão e ao redimensionar)
    function applyResponsiveOptions(calendar) {
        const mobile = MOBILE_QUERY.matches;
        const viewType = calendar.view ? calendar.view.type : "";
        const wanted = {
            dayMaxEvents: mobile ? 2 : 4,
            // Semana no celular: grade com rolagem própria, começando às 07:00
            height: mobile && viewType === "timeGridWeek" ? 620 : "auto",
        };
        let heightChanged = false;
        Object.entries(wanted).forEach(([name, value]) => {
            if (calendar.getOption(name) !== value) {
                calendar.setOption(name, value);
                if (name === "height") heightChanged = true;
            }
        });
        // Ao mudar a altura a grade volta ao topo (00:00); reposiciona no início do dia útil
        if (heightChanged && viewType === "timeGridWeek") {
            window.setTimeout(() => calendar.scrollToTime("07:00:00"), 0);
        }
    }

    function showMessage(box, type, text) {
        if (!box) return;
        box.className = `alert alert-${type}`;
        box.textContent = text;
        window.clearTimeout(box.hideTimer);
        box.hideTimer = window.setTimeout(() => box.classList.add("d-none"), 6000);
    }

    // Inclui "Hoje", "Amanhã", "em N dias"... ao lado do dia da semana (visões semanal e lista)
    function addRelativeDay(info) {
        if (info.view.type === "dayGridMonth") return;
        const target = info.el.querySelector(".fc-col-header-cell-cushion, .fc-list-day-text");
        if (!target || info.el.querySelector(".calendar-relative-day")) return;
        const days = daysFromToday(info.date);
        const badge = document.createElement("span");
        badge.className = "calendar-relative-day";
        if (days === 0) badge.classList.add("calendar-relative-day--today");
        else if (days < 0) badge.classList.add("calendar-relative-day--past");
        badge.title = relativeDayLabel(days);
        // Texto completo e curto; o CSS escolhe qual mostrar conforme a largura
        const full = document.createElement("span");
        full.className = "calendar-relative-day__full";
        full.textContent = relativeDayLabel(days);
        const short = document.createElement("span");
        short.className = "calendar-relative-day__short";
        short.textContent = relativeDayShortLabel(days);
        badge.append(full, short);
        target.insertAdjacentElement("afterend", badge);
    }

    async function saveReschedule(url, event) {
        const body = { next_activity_date: toDateString(event.start) };
        if (!event.allDay) body.scheduled_time = toTimeString(event.start);
        const response = await fetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Accept: "application/json",
                // Token CSRF da sessão (meta "csrf-token" em parts/head.ejs)
                "X-CSRF-Token":
                    document.querySelector('meta[name="csrf-token"]')?.getAttribute("content") ||
                    "",
            },
            body: JSON.stringify(body),
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
    }

    function init() {
        const el = document.getElementById("activityCalendar");
        if (!el || !window.FullCalendar) return;

        const messageBox = document.getElementById("activityCalendarMessage");
        const statusFilter = document.getElementById("calendarStatusFilter");
        const reschedulePrefix = el.getAttribute("data-reschedule-url-prefix");
        const allowedViews = ["dayGridMonth", "timeGridWeek", "listMonth"];
        const savedView = readStorage(VIEW_STORAGE_KEY);

        const savedStatus = readStorage(STATUS_STORAGE_KEY);
        if (
            statusFilter &&
            savedStatus &&
            statusFilter.querySelector(`option[value="${CSS.escape(savedStatus)}"]`)
        ) {
            statusFilter.value = savedStatus;
        }

        const calendar = new window.FullCalendar.Calendar(el, {
            locale: "pt-br",
            themeSystem: "bootstrap",
            initialView: allowedViews.includes(savedView) ? savedView : "dayGridMonth",
            headerToolbar: {
                left: "prev,next today",
                center: "title",
                right: "dayGridMonth,timeGridWeek,listMonth",
            },
            buttonText: { listMonth: "Lista" },
            height: "auto",
            nowIndicator: true,
            dayMaxEvents: MOBILE_QUERY.matches ? 2 : 4,
            allDayText: "Dia todo",
            views: {
                // Cabeçalho curto ("seg. 19"), que cabe em colunas estreitas
                timeGridWeek: {
                    dayHeaderFormat: { weekday: "short", day: "numeric" },
                    scrollTime: "07:00:00",
                },
            },
            windowResize: () => applyResponsiveOptions(calendar),
            navLinks: true,
            eventDisplay: "block",
            eventTimeFormat: { hour: "2-digit", minute: "2-digit", hour12: false },
            // Arrastar e soltar: só a próxima atividade, sem trocar entre "dia inteiro" e horário
            editable: false,
            eventDurationEditable: false,
            eventAllow: (dropInfo, draggedEvent) =>
                draggedEvent.extendedProps.kind === "next" &&
                dropInfo.allDay === draggedEvent.allDay,
            events: {
                url: el.getAttribute("data-events-url"),
                extraParams: () => ({ status: statusFilter ? statusFilter.value : "visible" }),
                failure: () =>
                    showMessage(
                        messageBox,
                        "danger",
                        "Não foi possível carregar as atividades do calendário.",
                    ),
            },
            eventDidMount: (info) => {
                const { lifeSphere, relevance, status, recurrence } = info.event.extendedProps;
                info.el.title = [
                    info.event.title,
                    lifeSphere,
                    relevance,
                    status,
                    recurrence ? `Repete: ${recurrence}` : null,
                ]
                    .filter(Boolean)
                    .join(" · ");
            },
            // Clique abre a visualização em pop-up (Ctrl/Shift + clique abre a página em nova aba)
            eventClick: (info) => {
                const { jsEvent } = info;
                if (
                    jsEvent.ctrlKey ||
                    jsEvent.metaKey ||
                    jsEvent.shiftKey ||
                    !window.ActivityViewModal
                ) {
                    return;
                }
                jsEvent.preventDefault();
                window.ActivityViewModal.open(info.event.extendedProps.activityId);
            },
            eventDrop: async (info) => {
                const event = info.event;
                const when = event.allDay
                    ? formatDateBr(event.start)
                    : `${formatDateBr(event.start)} às ${toTimeString(event.start)}`;
                if (!window.confirm(`Remarcar "${event.title}" para ${when}?`)) {
                    info.revert();
                    return;
                }
                try {
                    await saveReschedule(
                        `${reschedulePrefix}${event.extendedProps.activityId}/reschedule`,
                        event,
                    );
                    showMessage(messageBox, "success", "Atividade remarcada com sucesso.");
                    calendar.refetchEvents();
                } catch {
                    info.revert();
                    showMessage(
                        messageBox,
                        "danger",
                        "Não foi possível remarcar a atividade. Tente novamente.",
                    );
                }
            },
            dayHeaderDidMount: addRelativeDay,
            datesSet: (info) => {
                writeStorage(VIEW_STORAGE_KEY, info.view.type);
                applyResponsiveOptions(calendar);
            },
        });

        if (statusFilter) {
            statusFilter.addEventListener("change", () => {
                writeStorage(STATUS_STORAGE_KEY, statusFilter.value);
                calendar.refetchEvents();
            });
        }

        calendar.render();
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }
})();
