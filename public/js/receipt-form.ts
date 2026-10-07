// @ts-nocheck
export {};

const serviceTypeSelect = document.querySelector("#serviceTypeSelect");
const receiptConsumptionHelp = document.querySelector("#receiptConsumptionHelp");

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

const receiptBuildingSelect = document.querySelector('form select[name="building_id"]');
if (receiptBuildingSelect && serviceTypeSelect) {
  const updateServiceOptions = () => {
    for (const option of serviceTypeSelect.options) {
      const unavailable = Boolean(option.dataset.buildingId) && option.dataset.buildingId !== receiptBuildingSelect.value;
      option.hidden = unavailable;
      option.disabled = unavailable;
    }
    if (serviceTypeSelect.selectedOptions[0]?.disabled) serviceTypeSelect.value = "";
    updateConsumptionHelp();
  };
  receiptBuildingSelect.addEventListener("change", updateServiceOptions);
  updateServiceOptions();
}