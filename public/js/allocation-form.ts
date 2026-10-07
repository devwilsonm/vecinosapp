// @ts-nocheck
export {};

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