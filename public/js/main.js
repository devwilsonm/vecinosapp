document.querySelectorAll(".confirmable").forEach((form) => {
  form.addEventListener("submit", (event) => {
    const message = form.dataset.confirm || "¿Confirmar acción?";
    if (!window.confirm(message)) event.preventDefault();
  });
});

const buildingSelect = document.querySelector("#buildingSelect");
const floorSelect = document.querySelector("#floorSelect");
const serviceTypeSelect = document.querySelector("#serviceTypeSelect");
const receiptConsumptionHelp = document.querySelector("#receiptConsumptionHelp");

function fillFloorOptions() {
  if (!buildingSelect || !floorSelect) return;

  const selectedOption = buildingSelect.options[buildingSelect.selectedIndex];
  const floorCount = Number(selectedOption?.dataset.floors || 0);
  const selectedFloor = floorSelect.dataset.selectedFloor || floorSelect.value;

  floorSelect.innerHTML = '<option value="">Seleccionar piso</option>';

  for (let floor = 1; floor <= floorCount; floor += 1) {
    const option = document.createElement("option");
    option.value = String(floor);
    option.textContent = `Piso ${floor}`;
    if (String(floor) === String(selectedFloor)) option.selected = true;
    floorSelect.appendChild(option);
  }
}

if (buildingSelect && floorSelect) {
  fillFloorOptions();
  buildingSelect.addEventListener("change", () => {
    floorSelect.dataset.selectedFloor = "";
    fillFloorOptions();
  });
}

function sanitizeDecimal(value) {
  const normalized = value.replace(",", ".");
  const cleaned = normalized.replace(/[^\d.]/g, "");
  const parts = cleaned.split(".");
  if (parts.length === 1) return parts[0];
  return `${parts[0]}.${parts.slice(1).join("").slice(0, 3)}`;
}

document.querySelectorAll("[data-decimal-input]").forEach((input) => {
  input.addEventListener("input", () => {
    const sanitized = sanitizeDecimal(input.value);
    if (input.value !== sanitized) input.value = sanitized;
  });
});

function updateConsumptionHelp() {
  if (!serviceTypeSelect || !receiptConsumptionHelp) return;
  const messages = {
    luz: "Uso medido en kW; luego se reparte por ocupante.",
    agua: "Uso medido en m3; luego se reparte por ocupante.",
    internet: "Déjalo vacío si el costo se divide uniforme.",
    otro: "Úsalo solo si hay una unidad medible."
  };
  receiptConsumptionHelp.textContent = messages[serviceTypeSelect.value] || messages.otro;
}

if (serviceTypeSelect) {
  serviceTypeSelect.addEventListener("change", updateConsumptionHelp);
  updateConsumptionHelp();
}

const menuToggle = document.querySelector(".menu-toggle");
const mainNav = document.querySelector("#mainNav");

if (menuToggle && mainNav) {
  menuToggle.addEventListener("click", () => {
    const isOpen = mainNav.classList.toggle("open");
    menuToggle.setAttribute("aria-expanded", String(isOpen));
    menuToggle.setAttribute("aria-label", isOpen ? "Cerrar menú" : "Abrir menú");
  });
}

document.querySelectorAll(".nav-trigger").forEach((button) => {
  button.addEventListener("click", (event) => {
    event.stopPropagation();
    const item = button.closest(".nav-item");
    const isOpen = item.classList.contains("open");

    document.querySelectorAll(".nav-item.open").forEach((openItem) => {
      openItem.classList.remove("open");
      openItem.querySelector(".nav-trigger")?.setAttribute("aria-expanded", "false");
    });

    if (!isOpen) {
      item.classList.add("open");
      button.setAttribute("aria-expanded", "true");
    }
  });
});

document.addEventListener("click", (event) => {
  if (event.target.closest(".nav-item")) return;

  document.querySelectorAll(".nav-item.open").forEach((item) => {
    item.classList.remove("open");
    item.querySelector(".nav-trigger")?.setAttribute("aria-expanded", "false");
  });
});

document.querySelectorAll(".auto-submit").forEach((field) => {
  field.addEventListener("change", () => field.form?.submit());
});

document.querySelectorAll(".tab-button").forEach((button) => {
  button.addEventListener("click", () => {
    const targetId = button.dataset.tabTarget;
    document.querySelectorAll(".tab-button").forEach((item) => item.classList.toggle("active", item === button));
    document.querySelectorAll(".tab-panel").forEach((panel) => panel.classList.toggle("active", panel.id === targetId));
  });
});

const statsCarousel = document.querySelector(".stats-grid");
const statsDots = Array.from(document.querySelectorAll(".stats-dots button"));

if (statsCarousel && statsDots.length) {
  const slides = Array.from(statsCarousel.querySelectorAll(".stat"));

  const setActiveDot = (index) => {
    statsDots.forEach((dot, dotIndex) => dot.classList.toggle("active", dotIndex === index));
  };

  const updateActiveDot = () => {
    const carouselLeft = statsCarousel.getBoundingClientRect().left;
    const activeIndex = slides.reduce((closest, slide, index) => {
      const distance = Math.abs(slide.getBoundingClientRect().left - carouselLeft);
      return distance < closest.distance ? { index, distance } : closest;
    }, { index: 0, distance: Number.POSITIVE_INFINITY }).index;
    setActiveDot(activeIndex);
  };

  statsCarousel.addEventListener("scroll", () => window.requestAnimationFrame(updateActiveDot), { passive: true });
  statsDots.forEach((dot) => {
    dot.addEventListener("click", () => {
      const slide = slides[Number(dot.dataset.slideIndex || 0)];
      slide?.scrollIntoView({ behavior: "smooth", inline: "start", block: "nearest" });
    });
  });
  updateActiveDot();
}

const allocationForm = document.querySelector(".allocation-form");

function formatNumber(value) {
  return new Intl.NumberFormat("es-PE", {
    minimumFractionDigits: Number.isInteger(value) ? 0 : 1,
    maximumFractionDigits: 3
  }).format(value);
}

if (allocationForm) {
  const totalAmountCents = Number(allocationForm.dataset.totalAmount || 0);
  const target = Number(allocationForm.dataset.totalConsumption || 0) / 1000;
  const methodInputs = allocationForm.querySelectorAll('input[name="allocation_method"]');
  const sumLabel = document.querySelector("#allocationConsumptionSum");
  const diffLabel = document.querySelector("#allocationConsumptionDiff");
  const amountSumLabel = document.querySelector("#allocationAmountSum");

  const amountText = (cents) => `S/ ${(Number(cents || 0) / 100).toFixed(2)}`;

  const selectedRows = () => Array.from(allocationForm.querySelectorAll(".allocation-table tbody tr"))
    .filter((row) => row.querySelector(".allocation-check")?.checked);

  const currentMethod = () => allocationForm.querySelector('input[name="allocation_method"]:checked')?.value || "equal";

  const rowAllocationType = (row, method) => {
    if (method === "consumption") return "consumption";
    if (method === "mixed") return row.querySelector(".allocation-type")?.value || "equal";
    return "equal";
  };

  const splitCents = (total, rows) => {
    if (!rows.length) return new Map();
    const amounts = new Map();
    const base = Math.floor(total / rows.length);
    let assigned = 0;
    rows.forEach((row, index) => {
      const amount = index === rows.length - 1 ? total - assigned : base;
      assigned += amount;
      amounts.set(row, amount);
    });
    return amounts;
  };

  const splitMilliUnits = (totalMilli, rows) => {
    if (!rows.length) return new Map();
    const amounts = new Map();
    const base = Math.floor(totalMilli / rows.length);
    let assigned = 0;
    rows.forEach((row, index) => {
      const amount = index === rows.length - 1 ? totalMilli - assigned : base;
      assigned += amount;
      amounts.set(row, amount);
    });
    return amounts;
  };

  const rowConsumptionMilli = (row) => Math.round(Number(row.querySelector(".allocation-consumption")?.value || 0) * 1000);

  const distributeConsumption = () => {
    const method = currentMethod();
    const rows = method === "mixed"
      ? selectedRows().filter((row) => rowAllocationType(row, method) === "equal")
      : selectedRows().filter((row) => rowAllocationType(row, method) === "consumption");
    if (!rows.length || !["consumption", "mixed"].includes(method)) return;
    const targetMilli = Math.round(target * 1000);
    const measuredMilli = method === "mixed"
      ? selectedRows()
        .filter((row) => rowAllocationType(row, method) === "consumption")
        .reduce((sum, row) => sum + rowConsumptionMilli(row), 0)
      : 0;
    splitMilliUnits(Math.max(0, targetMilli - measuredMilli), rows).forEach((milli, row) => {
      const input = row.querySelector(".allocation-consumption");
      if (input && (!input.dataset.touched || input.value === "0" || input.value === "")) {
        input.value = formatNumber(milli / 1000);
      }
    });
  };

  allocationForm.querySelectorAll(".allocation-check").forEach((check) => {
    check.addEventListener("change", () => {
      const row = check.closest("tr");
      const consumptionInput = row?.querySelector(".allocation-consumption");
      if (!check.checked && consumptionInput) {
        consumptionInput.value = "0";
        consumptionInput.dataset.touched = "";
      }
      distributeConsumption();
      updateAllocationConsumption();
    });
  });

  const updateAllocationConsumption = () => {
    const method = currentMethod();
    allocationForm.classList.toggle("is-mixed", method === "mixed");
    allocationForm.querySelectorAll(".mixed-only").forEach((element) => {
      element.hidden = method !== "mixed";
    });
    const rows = selectedRows();
    let sum = 0;
    let amountSum = 0;
    const selectedAmounts = new Map();

    if (method === "equal" && rows.length) {
      splitCents(totalAmountCents, rows).forEach((amount, row) => selectedAmounts.set(row, amount));
    }

    if (method === "consumption" && rows.length) {
      let assigned = 0;
      rows.forEach((row, index) => {
        const input = row.querySelector(".allocation-consumption");
        const value = Number(input?.value || 0);
        const amount = index === rows.length - 1 ? totalAmountCents - assigned : (target > 0 ? Math.round((totalAmountCents * value) / target) : 0);
        assigned += amount;
        selectedAmounts.set(row, amount);
      });
    }

    if (method === "mixed" && rows.length) {
      let measuredAmountSum = 0;
      let measuredConsumptionMilli = 0;
      const equalRows = [];
      const consumptionRows = [];

      rows.forEach((row) => {
        if (rowAllocationType(row, method) === "consumption") consumptionRows.push(row);
        else equalRows.push(row);
      });

      consumptionRows.forEach((row, index) => {
        const input = row.querySelector(".allocation-consumption");
        const value = Number(input?.value || 0);
        measuredConsumptionMilli += rowConsumptionMilli(row);
        const isLastMeasuredWithoutEqual = equalRows.length === 0 && index === consumptionRows.length - 1;
        const amount = isLastMeasuredWithoutEqual
          ? totalAmountCents - measuredAmountSum
          : (target > 0 ? Math.round((totalAmountCents * value) / target) : 0);
        measuredAmountSum += amount;
        selectedAmounts.set(row, amount);
      });

      const remainingAmount = Math.max(0, totalAmountCents - measuredAmountSum);
      splitCents(remainingAmount, equalRows).forEach((amount, row) => selectedAmounts.set(row, amount));
      const remainingConsumptionMilli = Math.max(0, Math.round(target * 1000) - measuredConsumptionMilli);
      splitMilliUnits(remainingConsumptionMilli, equalRows).forEach((milli, row) => {
        const input = row.querySelector(".allocation-consumption");
        if (input) input.value = formatNumber(milli / 1000);
      });
    }

    allocationForm.querySelectorAll(".allocation-table tbody tr").forEach((row) => {
      const check = row.querySelector(".allocation-check");
      const input = row.querySelector(".allocation-consumption");
      const amountInput = row.querySelector(".allocation-amount");
      const typeSelect = row.querySelector(".allocation-type");
      if (!check || !input) return;
      const type = rowAllocationType(row, method);
      const enabled = check.checked && type === "consumption" && ["consumption", "mixed"].includes(method);
      input.disabled = !enabled;
      if (typeSelect) typeSelect.disabled = !check.checked || method !== "mixed";
      if (!check.checked) input.value = "0";
      let rowAmount = 0;
      if (check.checked && method === "consumption") {
        sum += Number(input.value || 0);
        rowAmount = selectedAmounts.get(row) || 0;
      } else if (check.checked) {
        if (method === "mixed") sum += Number(input.value || 0);
        rowAmount = selectedAmounts.get(row) || 0;
      }
      amountSum += rowAmount;
      if (amountInput) amountInput.value = amountText(rowAmount);
    });

    const diff = target - sum;
    if (sumLabel) sumLabel.textContent = method === "equal" ? "No aplica" : formatNumber(sum);
    if (diffLabel) {
      diffLabel.textContent = method === "equal" ? "No aplica" : formatNumber(diff);
      diffLabel.classList.toggle("ok", (method === "consumption" && Math.abs(diff) < 0.0005) || (method === "mixed" && diff >= 0));
      diffLabel.classList.toggle("danger-text", (method === "consumption" && Math.abs(diff) >= 0.0005) || (method === "mixed" && diff < 0));
    }
    if (amountSumLabel) amountSumLabel.textContent = amountText(amountSum);
  };

  allocationForm.querySelectorAll(".allocation-consumption").forEach((field) => {
    field.addEventListener("input", () => {
      field.dataset.touched = "1";
      updateAllocationConsumption();
    });
    field.addEventListener("change", updateAllocationConsumption);
  });
  allocationForm.querySelectorAll(".allocation-type").forEach((field) => {
    field.addEventListener("change", () => {
      if (field.value === "consumption") distributeConsumption();
      updateAllocationConsumption();
    });
  });
  methodInputs.forEach((field) => {
    field.addEventListener("change", () => {
      if (["consumption", "mixed"].includes(currentMethod())) distributeConsumption();
      updateAllocationConsumption();
    });
  });
  updateAllocationConsumption();
}
