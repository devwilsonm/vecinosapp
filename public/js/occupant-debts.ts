// @ts-nocheck
export {};

document.querySelector("[data-print-debt-report]")?.addEventListener("click", async (event) => {
  const button = event.currentTarget;
  button.disabled = true;
  try {
    const preparation = { pending: [] };
    document.dispatchEvent(new CustomEvent("vecinosapp:prepare-report-print", { detail: preparation }));
    await Promise.all(preparation.pending);
    window.print();
  } finally {
    button.disabled = false;
  }
});

const debtOccupantSearch = document.querySelector("[data-debt-occupant-search]");
const debtOccupantId = document.querySelector("[data-debt-occupant-id]");
if (debtOccupantSearch && debtOccupantId) {
  const list = document.querySelector("#debtOccupants");
  const options = [...list.querySelectorAll("[role=option]")];
  const empty = list.querySelector("[role=status]");
  const occupantOptions = new Map();
  let visibleOptions = [];
  let activeIndex = -1;
  options.forEach((option) => {
    let label = option.textContent.trim();
    if (occupantOptions.has(label)) label += ` (${option.dataset.occupantId})`;
    option.textContent = label;
    occupantOptions.set(label, option.dataset.occupantId);
    if (option.dataset.occupantId === debtOccupantId.value) debtOccupantSearch.value = label;
  });
  const setActive = (index) => {
    activeIndex = index;
    options.forEach((option) => option.setAttribute("aria-selected", "false"));
    const option = visibleOptions[index];
    if (option) {
      option.setAttribute("aria-selected", "true");
      debtOccupantSearch.setAttribute("aria-activedescendant", option.id);
      option.scrollIntoView({ block: "nearest" });
    } else {
      debtOccupantSearch.removeAttribute("aria-activedescendant");
    }
  };
  const closeList = () => {
    list.hidden = true;
    debtOccupantSearch.setAttribute("aria-expanded", "false");
    setActive(-1);
  };
  const updateDebtOccupant = () => {
    debtOccupantId.value = occupantOptions.get(debtOccupantSearch.value) || "";
    debtOccupantSearch.setCustomValidity(debtOccupantId.value ? "" : "Selecciona un ocupante de las sugerencias.");
  };
  const openList = () => {
    const query = debtOccupantSearch.value.trim().toLocaleLowerCase("es");
    visibleOptions = options.filter((option) => {
      option.hidden = !!query && !debtOccupantId.value && !option.textContent.toLocaleLowerCase("es").includes(query);
      return !option.hidden;
    });
    empty.hidden = visibleOptions.length > 0;
    list.hidden = false;
    debtOccupantSearch.setAttribute("aria-expanded", "true");
    setActive(-1);
  };
  const selectOption = (option) => {
    debtOccupantSearch.value = option.textContent;
    updateDebtOccupant();
    closeList();
  };
  debtOccupantSearch.addEventListener("focus", openList);
  debtOccupantSearch.addEventListener("click", openList);
  debtOccupantSearch.addEventListener("input", () => {
    updateDebtOccupant();
    openList();
  });
  debtOccupantSearch.addEventListener("blur", closeList);
  list.addEventListener("mousedown", (event) => event.preventDefault());
  list.addEventListener("click", (event) => {
    const option = event.target.closest("[role=option]");
    if (option) selectOption(option);
  });
  debtOccupantSearch.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      closeList();
    } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (list.hidden) openList();
      if (visibleOptions.length) setActive((activeIndex + (event.key === "ArrowDown" ? 1 : activeIndex < 0 ? 0 : -1) + visibleOptions.length) % visibleOptions.length);
    } else if (event.key === "Enter" && !list.hidden && activeIndex >= 0) {
      event.preventDefault();
      selectOption(visibleOptions[activeIndex]);
    }
  });
  debtOccupantSearch.form?.addEventListener("submit", (event) => {
    updateDebtOccupant();
    if (!debtOccupantSearch.reportValidity()) event.preventDefault();
  });
}