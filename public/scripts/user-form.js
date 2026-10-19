// Formulário de usuário: pré-visualização da foto escolhida antes de salvar.
// Usa FileReader (data:), permitido pela CSP (img-src 'self' data:).
(function () {
    const MAX_BYTES = 2 * 1024 * 1024;
    const TYPES = ["image/jpeg", "image/png", "image/webp"];

    function init() {
        const input = document.getElementById("photo");
        const img = document.getElementById("userPhotoImg");
        const initials = document.getElementById("userPhotoInitials");
        const remove = document.getElementById("remove_photo");
        if (!input || !img || !initials) return;

        const originalSrc = img.getAttribute("src");

        function showImage(src) {
            img.setAttribute("src", src);
            img.classList.remove("d-none");
            initials.classList.add("d-none");
        }

        function showInitials() {
            img.classList.add("d-none");
            initials.classList.remove("d-none");
        }

        input.addEventListener("change", () => {
            const file = input.files && input.files[0];
            if (!file) {
                if (originalSrc) showImage(originalSrc);
                else showInitials();
                return;
            }
            if (!TYPES.includes(file.type) || file.size > MAX_BYTES) {
                // A validação definitiva é feita no servidor; aqui só não mostra a prévia
                showInitials();
                return;
            }
            if (remove) remove.checked = false;
            const reader = new FileReader();
            reader.addEventListener("load", () => showImage(reader.result));
            reader.readAsDataURL(file);
        });

        if (remove) {
            remove.addEventListener("change", () => {
                if (remove.checked) {
                    input.value = "";
                    showInitials();
                } else if (originalSrc) {
                    showImage(originalSrc);
                }
            });
        }
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }
})();
