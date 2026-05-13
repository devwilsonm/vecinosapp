const express = require("express");
const { db } = require("../db");
const { requirePermission } = require("../utils/access");
const { buildingFilter, ensureBuildingAccess } = require("../utils/buildingAccess");
const { toMilliUnits } = require("../utils/consumption");
const { splitAmount } = require("../utils/money");
const { updateReceiptStatus } = require("../utils/status");

const router = express.Router();

router.use(requirePermission("allocations.manage"));

function redirectWith(res, url, message, type = "success") {
  res.redirect(`${url}?message=${encodeURIComponent(message)}&type=${type}`);
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

function allocationFormData(receipt, state = {}) {
  const occupants = db.prepare(`
    SELECT *
    FROM occupants
    WHERE is_active = 1 AND building_id = ?
    ORDER BY CAST(floor AS INTEGER), floor, unit, full_name
  `).all(receipt.building_id);
  const existing = db.prepare(`
    SELECT a.*, o.full_name, o.floor, o.unit
    FROM receipt_allocations a
    JOIN occupants o ON a.occupant_id = o.id
    WHERE a.receipt_id = ?
    ORDER BY o.floor, o.unit, o.full_name
  `).all(receipt.id);
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

function renderAllocationForm(res, receipt, state = {}, status = 200) {
  return res.status(status).render("allocations/form", allocationFormData(receipt, state));
}

router.get("/", (req, res) => {
  const access = buildingFilter(req.currentUser, "r.building_id", "WHERE");
  const receipts = db.prepare(`
    SELECT r.*, b.name AS building_name, COUNT(a.id) AS allocation_count
    FROM receipts r
    LEFT JOIN buildings b ON r.building_id = b.id
    LEFT JOIN receipt_allocations a ON r.id = a.receipt_id
    ${access.sql}
    GROUP BY r.id
    ORDER BY r.created_at DESC
  `).all(...access.params);
  res.render("allocations/index", { receipts });
});

router.get("/receipt/:id", (req, res) => {
  const receipt = db.prepare(`
    SELECT r.*, b.name AS building_name
    FROM receipts r
    LEFT JOIN buildings b ON r.building_id = b.id
    WHERE r.id = ?
  `).get(req.params.id);
  if (!receipt) return res.status(404).render("error", { title: "No encontrado", message: "Recibo no encontrado." });
  if (!ensureBuildingAccess(req, res, receipt.building_id)) return;
  renderAllocationForm(res, receipt);
});

router.post("/receipt/:id", (req, res) => {
  const receipt = db.prepare("SELECT * FROM receipts WHERE id = ?").get(req.params.id);
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
  const existing = db.prepare("SELECT * FROM receipt_allocations WHERE receipt_id = ?").all(req.params.id);
  const hasPayments = db.prepare(`
    SELECT COUNT(*) AS total
    FROM payments p
    JOIN receipt_allocations a ON p.allocation_id = a.id
    WHERE a.receipt_id = ?
  `).get(req.params.id).total;

  if (receipt.total_amount_cents <= 0) return fail("No se puede prorratear un recibo con monto cero.");
  if (selected.length === 0) return fail("Selecciona al menos un ocupante.");
  if (existing.length > 0 && !recalculate) return fail("Este recibo ya tiene prorrateo. Marca recalcular para reemplazarlo.");
  if (existing.length > 0 && hasPayments > 0) return fail("No se puede recalcular un prorrateo con pagos asociados.");

  const activeOccupants = db.prepare(`
    SELECT id, full_name, floor, unit
    FROM occupants
    WHERE is_active = 1 AND building_id = ? AND id IN (${selected.map(() => "?").join(",")})
    ORDER BY CAST(floor AS INTEGER), floor, unit, full_name
  `).all(receipt.building_id, ...selected);
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

  const save = db.transaction(() => {
    db.prepare("DELETE FROM receipt_allocations WHERE receipt_id = ?").run(req.params.id);
    const insert = db.prepare(`
      INSERT INTO receipt_allocations (receipt_id, occupant_id, assigned_amount_cents, consumption_milli, paid_amount_cents, balance_cents, status, created_by, updated_by)
      VALUES (?, ?, ?, ?, 0, ?, 'pendiente', ?, ?)
    `);
    activeOccupants.forEach((occupant, index) => {
      const consumptionMilli = consumptionByOccupant.get(occupant.id) || 0;
      const assignedAmount = sharesByOccupant.get(occupant.id) || 0;
      insert.run(receipt.id, occupant.id, assignedAmount, consumptionMilli, assignedAmount, req.currentUser.id, req.currentUser.id);
    });
    updateReceiptStatus(receipt.id);
    db.prepare("UPDATE receipts SET updated_by = ? WHERE id = ?").run(req.currentUser.id, receipt.id);
  });

  save();
  redirectWith(res, `/receipts/${receipt.id}`, "Prorrateo generado correctamente.");
});

module.exports = router;
