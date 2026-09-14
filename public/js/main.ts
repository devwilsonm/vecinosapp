// Browser script migrated from JavaScript; DOM typing is kept permissive while the UI is incrementally typed.
// @ts-nocheck

const themeStorageKey = "vecinosapp-theme";
const themeRoot = document.documentElement;
const isAuthenticated = themeRoot.dataset.authenticated === "true";
const serverThemeAuthoritative = themeRoot.dataset.themeServer === "true";

function applyTheme(theme) {
  const isDark = theme === "dark";
  themeRoot.dataset.theme = isDark ? "dark" : "light";
  document.querySelectorAll("[data-theme-toggle]").forEach((button) => {
    const label = isDark ? "Activar tema claro" : "Activar tema oscuro";
    button.setAttribute("aria-pressed", String(isDark));
    button.setAttribute("aria-label", label);
    button.setAttribute("title", label);
  });
  document.dispatchEvent(new CustomEvent("vecinosapp:theme-changed", { detail: { theme: isDark ? "dark" : "light" } }));
}

let savedTheme = themeRoot.dataset.theme === "dark" ? "dark" : "light";
if (!isAuthenticated && !serverThemeAuthoritative) {
  try {
    if (localStorage.getItem(themeStorageKey) === "dark") savedTheme = "dark";
  } catch {
    savedTheme = "light";
  }
}
applyTheme(savedTheme);

const csrfToken = document.querySelector('meta[name="csrf-token"]')?.getAttribute("content") || "";

document.querySelectorAll("[data-theme-toggle]").forEach((button) => {
  button.addEventListener("click", async () => {
    const nextTheme = themeRoot.dataset.theme === "dark" ? "light" : "dark";
    applyTheme(nextTheme);
    try {
      localStorage.setItem(themeStorageKey, nextTheme);
    } catch {
      // Continue without persistence when browser storage is unavailable.
    }
    document.cookie = `vecinosapp_theme=${nextTheme}; Max-Age=31536000; Path=/; SameSite=Lax`;
    if (!isAuthenticated) return;
    try {
      const response = await fetch("/theme", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
        body: new URLSearchParams({ _csrf: csrfToken, theme: nextTheme })
      });
      if (!response.ok) throw new Error("No se pudo guardar el tema.");
    } catch (error) {
      console.error(error);
    }
  });
});

document.querySelectorAll(".confirmable").forEach((form) => {
  form.addEventListener("submit", (event) => {
    const message = form.dataset.confirm || "¿Confirmar acción?";
    if (!window.confirm(message)) event.preventDefault();
  });
});

const roleInfoModal = document.querySelector("#roleInfoModal");
const roleInfoOpen = document.querySelector("[data-role-info-open]");

if (roleInfoModal && roleInfoOpen) {
  const roleInfoDialog = roleInfoModal.querySelector("[role=dialog]");
  const roleInfoClose = roleInfoModal.querySelector("[data-role-info-close].role-info-close");
  let roleInfoPreviousFocus = null;

  const closeRoleInfo = () => {
    roleInfoModal.hidden = true;
    document.body.classList.remove("modal-open");
    roleInfoPreviousFocus?.focus();
  };

  const openRoleInfo = () => {
    roleInfoPreviousFocus = document.activeElement;
    roleInfoModal.hidden = false;
    document.body.classList.add("modal-open");
    roleInfoClose?.focus();
  };

  roleInfoOpen.addEventListener("click", openRoleInfo);
  roleInfoModal.addEventListener("click", (event) => {
    if (event.target.closest("[data-role-info-close]")) closeRoleInfo();
  });
  roleInfoDialog?.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeRoleInfo();
  });
}

const localDateTimeFormatter = new Intl.DateTimeFormat("es-PE", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false
});

document.querySelectorAll("[data-local-datetime]").forEach((element) => {
  const value = element.dataset.localDatetime;
  if (!value) return;
  const utcDate = new Date(`${value.replace(" ", "T")}Z`);
  if (Number.isNaN(utcDate.getTime())) return;
  element.textContent = localDateTimeFormatter.format(utcDate);
  element.title = `${value} UTC`;
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
  const allocationChecks = () => Array.from(allocationForm.querySelectorAll(".allocation-check"));

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

  const resetUncheckedRow = (check) => {
    const input = check.closest("tr")?.querySelector(".allocation-consumption");
    if (input) {
      input.value = "0";
      input.dataset.touched = "";
    }
  };

  const syncSelectionControls = () => {
    const checks = allocationChecks();
    const selectedCount = checks.filter((check) => check.checked).length;
    const selectAll = allocationForm.querySelector(".allocation-select-all");
    if (selectAll) {
      selectAll.checked = checks.length > 0 && selectedCount === checks.length;
      selectAll.indeterminate = selectedCount > 0 && selectedCount < checks.length;
    }
    allocationForm.querySelectorAll(".floor-select-all").forEach((floorSelect) => {
      const floor = floorSelect.closest(".floor-accordion");
      const floorChecks = Array.from(floor?.querySelectorAll(".allocation-check") || []);
      const floorSelectedCount = floorChecks.filter((check) => check.checked).length;
      floorSelect.checked = floorChecks.length > 0 && floorSelectedCount === floorChecks.length;
      floorSelect.indeterminate = floorSelectedCount > 0 && floorSelectedCount < floorChecks.length;
    });
  };

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
      if (!check.checked) resetUncheckedRow(check);
      distributeConsumption();
      updateAllocationConsumption();
    });
  });

  const applySelection = (checks, selected) => {
    checks.forEach((check) => {
      check.checked = selected;
      if (!selected) resetUncheckedRow(check);
    });
    distributeConsumption();
    updateAllocationConsumption();
  };

  allocationForm.querySelector(".allocation-select-all")?.addEventListener("change", (event) => {
    applySelection(allocationChecks(), event.currentTarget.checked);
  });
  allocationForm.querySelectorAll(".floor-select-all").forEach((floorSelect) => {
    floorSelect.closest(".floor-select-control")?.addEventListener("click", (event) => event.stopPropagation());
    floorSelect.addEventListener("change", (event) => {
      const floor = event.currentTarget.closest(".floor-accordion");
      applySelection(Array.from(floor?.querySelectorAll(".allocation-check") || []), event.currentTarget.checked);
    });
  });

  const syncMethodSelection = () => {
    const selectedMethod = currentMethod();
    allocationForm.querySelectorAll('label.check.item').forEach((label) => {
      const input = label.querySelector<HTMLInputElement>('input[name="allocation_method"]');
      label.classList.toggle("is-selected", input?.checked === true && input.value === selectedMethod);
    });
  };

  const updateAllocationConsumption = () => {
    const method = currentMethod();
    syncMethodSelection();
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
    syncSelectionControls();
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

function shareUrlFrom(element) {
  const path = element.closest("[data-share-path]")?.dataset.sharePath;
  return path ? new URL(path, window.location.origin).href : window.location.href;
}

function setShareStatus(element, message) {
  const status = element.closest("[data-share-path]")?.querySelector("[data-share-status]");
  if (status) status.textContent = message;
}

async function copyShareUrl(element) {
  const url = shareUrlFrom(element);
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(url);
    } else {
      const input = document.createElement("textarea");
      input.value = url;
      input.setAttribute("readonly", "");
      input.style.position = "fixed";
      input.style.opacity = "0";
      document.body.appendChild(input);
      input.select();
      document.execCommand("copy");
      input.remove();
    }
    setShareStatus(element, "Enlace copiado.");
  } catch {
    setShareStatus(element, "No se pudo copiar el enlace.");
  }
}

document.querySelectorAll("[data-copy-share]").forEach((button) => {
  button.addEventListener("click", () => copyShareUrl(button));
});

const massPaymentForm = document.querySelector("[data-mass-payment-form]");
if (massPaymentForm) {
  const massAmountText = (cents) => `S/ ${(Number(cents || 0) / 100).toFixed(2)}`;
  const checks = Array.from(massPaymentForm.querySelectorAll("[data-mass-payment-check]"));
  const selectAll = massPaymentForm.querySelector("[data-mass-select-all]");
  const total = massPaymentForm.querySelector("[data-mass-payment-total]");
  const count = massPaymentForm.querySelector("[data-mass-payment-count]");
  const updateMassPaymentSummary = () => {
    const selected = checks.filter((check) => check.checked);
    const totalCents = selected.reduce((sum, check) => sum + Number(check.dataset.balanceCents || 0), 0);
    if (total) total.textContent = massAmountText(totalCents);
    if (count) count.textContent = `${selected.length} deuda${selected.length === 1 ? "" : "s"} seleccionada${selected.length === 1 ? "" : "s"}`;
    if (selectAll) {
      selectAll.checked = checks.length > 0 && selected.length === checks.length;
      selectAll.indeterminate = selected.length > 0 && selected.length < checks.length;
    }
  };
  selectAll?.addEventListener("change", () => {
    checks.forEach((check) => { check.checked = selectAll.checked; });
    updateMassPaymentSummary();
  });
  checks.forEach((check) => check.addEventListener("change", updateMassPaymentSummary));
  updateMassPaymentSummary();
}

document.querySelectorAll("[data-share-native]").forEach((button) => {
  button.addEventListener("click", async () => {
    const url = shareUrlFrom(button);
    const title = button.closest("[data-share-title]")?.dataset.shareTitle || "Cuotas";
    if (navigator.share) {
      try {
        await navigator.share({ title, text: title, url });
        setShareStatus(button, "Compartido.");
      } catch (error) {
        if (error?.name !== "AbortError") setShareStatus(button, "No se pudo compartir.");
      }
      return;
    }
    await copyShareUrl(button);
  });
});

document.querySelectorAll("[data-share-whatsapp]").forEach((button) => {
  button.addEventListener("click", () => {
    const url = shareUrlFrom(button);
    const title = button.closest("[data-share-title]")?.dataset.shareTitle || "Cuotas";
    window.open(`https://wa.me/?text=${encodeURIComponent(`${title}: ${url}`)}`, "_blank", "noopener");
  });
});

function stylesheetText() {
  return Array.from(document.styleSheets).map((sheet) => {
    try {
      return Array.from(sheet.cssRules).map((rule) => rule.cssText).join("\n");
    } catch {
      return "";
    }
  }).join("\n");
}

function elementToPng(element) {
  const width = Math.max(element.scrollWidth, element.clientWidth);
  const height = element.scrollHeight;
  const clone = element.cloneNode(true);
  clone.style.width = `${width}px`;
  const styles = stylesheetText().replace(/<\/style/gi, "<\\/style");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><foreignObject width="100%" height="100%"><div xmlns="http://www.w3.org/1999/xhtml"><style>${styles}</style>${clone.outerHTML}</div></foreignObject></svg>`;
  const image = new Image();
  const svgUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

  return new Promise((resolve, reject) => {
    image.onload = () => {
      const scale = Math.min(window.devicePixelRatio || 1, 2);
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(width * scale);
      canvas.height = Math.ceil(height * scale);
      const context = canvas.getContext("2d");
      context.scale(scale, scale);
      context.drawImage(image, 0, 0, width, height);
      canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("No se pudo crear la imagen.")), "image/png");
    };
    image.onerror = () => reject(new Error("No se pudo capturar la vista."));
    image.src = svgUrl;
  });
}

document.querySelectorAll("[data-capture-target]").forEach((button) => {
  button.addEventListener("click", async () => {
    const target = document.getElementById(button.dataset.captureTarget);
    if (!target) return;
    const title = button.closest("[data-share-title]")?.dataset.shareTitle || "Cuotas";
    const fileName = `${title.toLowerCase().replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "cuotas"}.png`;
    button.disabled = true;
    setShareStatus(button, "Generando captura...");
    try {
      const blob = await elementToPng(target);
      const file = new File([blob], fileName, { type: "image/png" });
      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ title, files: [file] });
        setShareStatus(button, "Captura compartida.");
      } else {
        const download = document.createElement("a");
        download.href = URL.createObjectURL(blob);
        download.download = fileName;
        download.click();
        URL.revokeObjectURL(download.href);
        setShareStatus(button, "Captura descargada.");
      }
    } catch (error) {
      if (error?.name !== "AbortError") setShareStatus(button, "No se pudo generar la captura.");
    } finally {
      button.disabled = false;
    }
  });
});
