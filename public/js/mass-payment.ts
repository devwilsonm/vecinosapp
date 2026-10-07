// @ts-nocheck
export {};

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