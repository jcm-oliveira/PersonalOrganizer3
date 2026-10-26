// Menu "⋮" de ações dos registros nas telas de consulta (cms-Activity-Q-actions.ejs).
// O menu é posicionado em relação à tela (position: fixed): assim não é cortado pelos
// blocos com rolagem interna. Fecha ao escolher uma opção, clicar fora, rolar a página,
// redimensionar ou com Esc. Teclado: setas, Home/End e Tab.
(function () {
    let open = null; // { toggle, list }

    const items = (list) =>
        [...list.querySelectorAll(".row-menu__item")].filter((item) => !item.disabled);

    function close({ focusToggle = false } = {}) {
        if (!open) return;
        const { toggle, list } = open;
        list.hidden = true;
        list.classList.remove("row-menu__list--open");
        toggle.setAttribute("aria-expanded", "false");
        open = null;
        if (focusToggle) toggle.focus();
    }

    // Abaixo do botão, alinhado à direita; acima dele se não couber na tela
    function position(toggle, list) {
        const rect = toggle.getBoundingClientRect();
        const margin = 4;
        list.style.top = "0px";
        list.style.left = "0px";
        const { width, height } = list.getBoundingClientRect();
        let top = rect.bottom + margin;
        if (top + height > window.innerHeight - margin && rect.top - height - margin > 0) {
            top = rect.top - height - margin;
        }
        const left = Math.max(
            margin,
            Math.min(rect.right - width, window.innerWidth - width - margin),
        );
        list.style.top = `${Math.round(top)}px`;
        list.style.left = `${Math.round(left)}px`;
    }

    function openMenu(toggle, { focus = "first" } = {}) {
        const list = toggle.parentElement.querySelector(".row-menu__list");
        if (!list) return;
        close();
        list.hidden = false;
        list.classList.add("row-menu__list--open");
        toggle.setAttribute("aria-expanded", "true");
        position(toggle, list);
        open = { toggle, list };
        const enabled = items(list);
        const target = focus === "last" ? enabled[enabled.length - 1] : enabled[0];
        if (target) target.focus();
    }

    document.addEventListener("click", (event) => {
        const toggle = event.target.closest(".row-menu__toggle");
        if (toggle) {
            event.preventDefault();
            if (open && open.toggle === toggle) close();
            else openMenu(toggle);
            return;
        }
        if (!open) return;
        // Escolher uma opção fecha o menu (a ação do item segue normalmente)
        if (event.target.closest(".row-menu__item") || !open.list.contains(event.target)) close();
    });

    document.addEventListener("keydown", (event) => {
        const toggle = event.target.closest && event.target.closest(".row-menu__toggle");
        if (toggle && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
            event.preventDefault();
            openMenu(toggle, { focus: event.key === "ArrowUp" ? "last" : "first" });
            return;
        }
        if (!open) return;
        const enabled = items(open.list);
        const index = enabled.indexOf(document.activeElement);
        if (event.key === "Escape") {
            event.preventDefault();
            close({ focusToggle: true });
        } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            const step = event.key === "ArrowDown" ? 1 : -1;
            enabled[(index + step + enabled.length) % enabled.length]?.focus();
        } else if (event.key === "Home" || event.key === "End") {
            event.preventDefault();
            enabled[event.key === "Home" ? 0 : enabled.length - 1]?.focus();
        } else if (event.key === "Tab") {
            close();
        }
    });

    // Rolagem (inclusive dentro dos blocos) ou mudança de tamanho: o menu fecha
    window.addEventListener("scroll", () => close(), true);
    window.addEventListener("resize", () => close());
})();
