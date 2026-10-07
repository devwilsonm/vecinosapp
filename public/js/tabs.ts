// @ts-nocheck
export {};

document.querySelectorAll(".tab-button").forEach((button) => {
  button.addEventListener("click", () => {
    const targetId = button.dataset.tabTarget;
    const report = button.closest("[data-occupant-report]");
    const scope = report || document;
    scope.querySelectorAll(".tab-button").forEach((item) => {
      item.classList.toggle("active", item === button);
      if (report) {
        item.setAttribute("aria-selected", String(item === button));
        item.tabIndex = item === button ? 0 : -1;
      }
    });
    scope.querySelectorAll(".tab-panel").forEach((panel) => {
      panel.classList.toggle("active", panel.id === targetId);
      if (report) panel.hidden = panel.id !== targetId;
    });
    if (report) document.dispatchEvent(new CustomEvent("vecinosapp:report-tab-changed", { detail: targetId }));
  });
  if (button.closest("[data-report-tabs]")) button.addEventListener("keydown", (event) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const buttons = [...button.parentElement.querySelectorAll(".tab-button")];
    const index = buttons.indexOf(button);
    const next = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1 : (index + (event.key === "ArrowRight" ? 1 : -1) + buttons.length) % buttons.length;
    buttons[next].focus();
    buttons[next].click();
  });
});