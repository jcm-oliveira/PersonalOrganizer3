// Mensagens após uma ação (parts/messages.ejs): fecham sozinhas após o tempo de
// data-auto-dismiss (ms). O "×" usa o próprio Bootstrap (data-dismiss="alert").
// Também tira "msg" do endereço, para a mensagem não voltar ao recarregar a página.
(function () {
    function init() {
        const alerts = document.querySelectorAll(".alert[data-auto-dismiss]");
        if (alerts.length === 0) return;

        alerts.forEach((alert) => {
            const delay = Number(alert.getAttribute("data-auto-dismiss")) || 5000;
            setTimeout(() => {
                if (!document.body.contains(alert)) return; // já fechada pelo "×"
                if (window.jQuery && window.jQuery.fn.alert) window.jQuery(alert).alert("close");
                else alert.remove();
            }, delay);
        });

        try {
            const url = new URL(window.location.href);
            if (url.searchParams.has("msg")) {
                url.searchParams.delete("msg");
                window.history.replaceState(null, "", url.pathname + url.search + url.hash);
            }
        } catch {
            // navegador sem URL/history: a mensagem pode reaparecer ao recarregar
        }
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }
})();
