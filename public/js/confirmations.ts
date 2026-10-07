// @ts-nocheck
export {};

document.querySelectorAll(".confirmable").forEach((form) => {
  form.addEventListener("submit", (event) => {
    const message = form.dataset.confirm || "¿Confirmar acción?";
    if (!window.confirm(message)) event.preventDefault();
  });
});