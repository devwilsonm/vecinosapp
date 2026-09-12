const express = require("express");
const { canAccessAllBuildings, requirePermission } = require("../utils/access");
const { ensureBuildingAccess, permittedBuildingIds } = require("../utils/buildingAccess");
const { toMilliUnits } = require("../utils/consumption");
const { splitAmount } = require("../utils/money");
const { allocationRepository, publicAllocationRepository } = require("../infrastructure/container");

const router = express.Router();

type AllocationFormState = {
  selectedIds?: number[];
  allocationMethod?: string;
  postedConsumptions?: Record<string, any>;
  postedAllocationTypes?: Record<string, any>;
  recalculate?: boolean;
  errors?: string[];
};

router.use(requirePermission("allocations.manage"));

function redirectWith(res, url, message, type = "success") {
  res.redirect(`${url}?message=${encodeURIComponent(message)}&type=${type}`);
}

async function publicSharePath(receiptId) {
  const link = await publicAllocationRepository.findOrCreateLink(receiptId);
  return `/shared/allocations/${link.token}`;
}

function parseSelectedOccupants(value) {
  return (Array.isArray(value) ? value : value ? [value] : []).map(Number).filter((id) => Number.isInteger(id) && id > 0);
}

function allocationMethodFromBody(body) {
  const value = Array.isArray(body.allocation_method) ? body.allocation_method[body.allocation_method.length - 1] : body.allocation_method;
  if (value === "consumption" || value === "mixed") return value;
  return "equal";
}

function allocationTypeFromBody(body, occupantId) {
  const value = body[`allocation_type_${occupantId}`];
  return value === "consumption" ? "consumption" : "equal";
}

function splitByConsumption(totalCents, consumptions) {
  const totalConsumption = consumptions.reduce((sum, item) => sum + item, 0);
  let assignedSum = 0;
  return consumptions.map((item, index) => {
    if (index === consumptions.length - 1) return totalCents - assignedSum;
    const amount = Math.round((totalCents * item) / totalConsumption);
    assignedSum += amount;
    return amount;
  });
}

async function allocationFormData(receipt, state: AllocationFormState = {}) {
  const [occupants, existing] = await Promise.all([
    allocationRepository.listFormOccupants(receipt.building_id),
    allocationRepository.listByReceipt(receipt.id)
  ]);
  const existingByOccupant = existing.reduce((items, allocation) => {
    items[allocation.occupant_id] = allocation;
    return items;
  }, {});
  const floorIndex = new Map();
  const existingByFloor = existing.reduce((floors, allocation) => {
    const floorKey = allocation.floor || "Sin piso";
    let group = floorIndex.get(floorKey);
    if (!group) {
      group = {
        floor: floorKey,
        allocations: [],
        assigned_amount_cents: 0,
        paid_amount_cents: 0,
        balance_cents: 0
      };
      floorIndex.set(floorKey, group);
      floors.push(group);
    }
    group.allocations.push(allocation);
    group.assigned_amount_cents += allocation.assigned_amount_cents || 0;
    group.paid_amount_cents += allocation.paid_amount_cents || 0;
    group.balance_cents += allocation.balance_cents || 0;
    return floors;
  }, []);
  const selectedIds = new Set(state.selectedIds || existing.map((item) => item.occupant_id));
  const allocationMethod = state.allocationMethod || "equal";
  const occupantFloorIndex = new Map();
  const occupantsByFloor = occupants.reduce((floors, occupant) => {
    const floorKey = occupant.floor || "Sin piso";
    let group = occupantFloorIndex.get(floorKey);
    if (!group) {
      group = { floor: floorKey, occupants: [] };
      occupantFloorIndex.set(floorKey, group);
      floors.push(group);
    }
    group.occupants.push(occupant);
    return floors;
  }, []);

  return {
    receipt,
    occupants,
    occupantsByFloor,
    existing,
    existingByFloor,
    selectedIds,
    existingByOccupant,
    allocationMethod,
    postedConsumptions: state.postedConsumptions || {},
    postedAllocationTypes: state.postedAllocationTypes || {},
    recalculate: Boolean(state.recalculate),
    errors: state.errors || []
  };
}

async function renderAllocationForm(res, receipt, state: AllocationFormState = {}, status = 200) {
  const viewData = await allocationFormData(receipt, state);
  return res.status(status).render("allocations/form", {
    ...viewData,
    sharePath: viewData.existing.length ? await publicSharePath(receipt.id) : null
  });
}

router.get("/", async (req, res) => {
  const receipts = await allocationRepository.listReceipts(canAccessAllBuildings(req.currentUser), permittedBuildingIds(req.currentUser));
  for (const receipt of receipts) {
    if (Number(receipt.allocation_count) > 0) receipt.sharePath = await publicSharePath(receipt.id);
  }
  res.render("allocations/index", { receipts });
});

router.get("/receipt/:id", async (req, res) => {
  const receipt = await allocationRepository.findReceipt(req.params.id);
  if (!receipt) return res.status(404).render("error", { title: "No encontrado", message: "Recibo no encontrado." });
  if (!ensureBuildingAccess(req, res, receipt.building_id)) return;
  await renderAllocationForm(res, receipt);
});

router.post("/receipt/:id", async (req, res) => {
  const receipt = await allocationRepository.findReceipt(req.params.id);
  if (!receipt) return res.status(404).render("error", { title: "No encontrado", message: "Recibo no encontrado." });
  if (!ensureBuildingAccess(req, res, receipt.building_id)) return;

  const selected = parseSelectedOccupants(req.body.occupant_ids);
  const allocationMethod = allocationMethodFromBody(req.body);
  const recalculate = Boolean(req.body.recalculate);
  const postedConsumptions = Object.fromEntries(
    Object.entries(req.body)
      .filter(([key]) => key.startsWith("consumption_"))
      .map(([key, value]) => [key.replace("consumption_", ""), value])
  );
  const postedAllocationTypes = Object.fromEntries(
    Object.entries(req.body)
      .filter(([key]) => key.startsWith("allocation_type_"))
      .map(([key, value]) => [key.replace("allocation_type_", ""), value])
  );
  const fail = (message, status = 400) => renderAllocationForm(res, receipt, {
    selectedIds: selected,
    allocationMethod,
    postedConsumptions,
    postedAllocationTypes,
    recalculate,
    errors: [message]
  }, status);
  const [existing, hasPayments] = await Promise.all([
    allocationRepository.listByReceipt(req.params.id),
    allocationRepository.countPaymentsByReceipt(req.params.id)
  ]);

  if (receipt.total_amount_cents <= 0) return fail("No se puede prorratear un recibo con monto cero.");
  if (selected.length === 0) return fail("Selecciona al menos un ocupante.");
  if (existing.length > 0 && !recalculate) return fail("Este recibo ya tiene prorrateo. Marca recalcular para reemplazarlo.");
  if (existing.length > 0 && hasPayments > 0) return fail("No se puede recalcular un prorrateo con pagos asociados.");

  const activeOccupants = await allocationRepository.listFormOccupants(receipt.building_id, selected);
  if (activeOccupants.length === 0) return fail("No hay ocupantes activos válidos para prorratear.");

  let consumptionByOccupant = new Map();
  const sharesByOccupant = new Map();
  if (allocationMethod === "consumption") {
    if (receipt.consumption_total_milli <= 0) {
      return fail("Este recibo no tiene consumo total para prorratear por consumo.");
    }
    const consumptions = [];
    for (const occupant of activeOccupants) {
      let consumptionMilli = 0;
      try {
        consumptionMilli = toMilliUnits(req.body[`consumption_${occupant.id}`]);
      } catch {
        return fail(`El consumo de ${occupant.full_name} no es válido.`);
      }
      if (consumptionMilli <= 0) return fail(`El consumo de ${occupant.full_name} debe ser mayor a cero.`);
      consumptionByOccupant.set(occupant.id, consumptionMilli);
      consumptions.push(consumptionMilli);
    }
    const totalConsumption = consumptions.reduce((sum, item) => sum + item, 0);
    if (totalConsumption !== receipt.consumption_total_milli) {
      return fail("La suma de consumos asignados debe coincidir con el consumo total del recibo.");
    }
    splitByConsumption(receipt.total_amount_cents, consumptions).forEach((amount, index) => {
      sharesByOccupant.set(activeOccupants[index].id, amount);
    });
  } else if (allocationMethod === "mixed") {
    if (receipt.consumption_total_milli <= 0) {
      return fail("Este recibo no tiene consumo total para prorratear de forma mixta.");
    }
    const consumptionOccupants = [];
    const equalOccupants = [];
    let measuredAmountSum = 0;
    let measuredConsumptionSum = 0;

    for (const occupant of activeOccupants) {
      const allocationType = allocationTypeFromBody(req.body, occupant.id);
      if (allocationType === "consumption") {
        let consumptionMilli = 0;
        try {
          consumptionMilli = toMilliUnits(req.body[`consumption_${occupant.id}`]);
        } catch {
          return fail(`El consumo de ${occupant.full_name} no es válido.`);
        }
        if (consumptionMilli <= 0) return fail(`El consumo de ${occupant.full_name} debe ser mayor a cero.`);
        consumptionByOccupant.set(occupant.id, consumptionMilli);
        consumptionOccupants.push({ occupant, consumptionMilli });
        measuredConsumptionSum += consumptionMilli;
      } else {
        equalOccupants.push(occupant);
      }
    }

    if (measuredConsumptionSum > receipt.consumption_total_milli) {
      return fail("La suma de consumos medidos no puede superar el consumo total del recibo.");
    }
    if (equalOccupants.length === 0 && measuredConsumptionSum !== receipt.consumption_total_milli) {
      return fail("Si todos pagan por consumo, la suma debe coincidir con el consumo total del recibo.");
    }

    consumptionOccupants.forEach(({ occupant, consumptionMilli }, index) => {
      const isLastMeasuredWithoutEqual = equalOccupants.length === 0 && index === consumptionOccupants.length - 1;
      const amount = isLastMeasuredWithoutEqual
        ? receipt.total_amount_cents - measuredAmountSum
        : Math.round((receipt.total_amount_cents * consumptionMilli) / receipt.consumption_total_milli);
      measuredAmountSum += amount;
      sharesByOccupant.set(occupant.id, amount);
    });

    const remainingAmount = receipt.total_amount_cents - measuredAmountSum;
    if (remainingAmount < 0) return fail("El monto calculado por consumo supera el total del recibo.");
    splitAmount(remainingAmount, equalOccupants.length).forEach((amount, index) => {
      sharesByOccupant.set(equalOccupants[index].id, amount);
    });
  } else {
    splitAmount(receipt.total_amount_cents, activeOccupants.length).forEach((amount, index) => {
      sharesByOccupant.set(activeOccupants[index].id, amount);
    });
  }

  await allocationRepository.replace(receipt.id, activeOccupants.map((occupant) => ({ occupant_id: occupant.id, assigned_amount_cents: sharesByOccupant.get(occupant.id) || 0, consumption_milli: consumptionByOccupant.get(occupant.id) || 0 })), req.currentUser.id);
  redirectWith(res, `/receipts/${receipt.id}`, "Prorrateo generado correctamente.");
});

module.exports = router;