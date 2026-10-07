// @ts-nocheck
export {};

const buildingSelect = document.querySelector("#buildingSelect");
const floorSelect = document.querySelector("#floorSelect");

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