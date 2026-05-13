const express = require("express");
const { db } = require("../db");
const { requirePermission } = require("../utils/access");
const { activeBuildingsForUser, buildingFilter, ensureBuildingAccess, hasBuildingAccess } = require("../utils/buildingAccess");
const { consumptionUnitFor, toMilliUnits } = require("../utils/consumption");
const { toCents } = require("../utils/money");
const { cleanText, isDate } = require("../utils/validation");

const router = express.Router();

router.use(requirePermission("receipts.manage"));

function redirectWith(res, url, message, type = "success") {
  res.redirect(`${url}?message=${encodeURIComponent(message)}&type=${type}`);
}

function activeBuildings(user, selectedId = 0) {
  return activeBuildingsForUser(db, user, selectedId);
}

function validateReceipt(body, user, id = 0) {
  const errors = [];
  ["building_id", "service_type", "receipt_number", "period", "issue_date", "due_date", "total_amount"].forEach((field) => {
    if (!String(body[field] || "").trim()) errors.push("Completa todos los campos obligatorios.");
  });
  if (!["agua", "luz", "internet", "otro"].includes(body.service_type)) errors.push("Selecciona un tipo de servicio válido.");
  if (body.issue_date && !isDate(body.issue_date)) errors.push("La fecha de emisión no es válida.");
  if (body.due_date && !isDate(body.due_date)) errors.push("La fecha de vencimiento no es válida.");
  const building = db.prepare("SELECT id FROM buildings WHERE id = ? AND is_active = 1").get(Number(body.building_id));
  if (!building) errors.push("Selecciona un edificio activo.");
  if (building && !hasBuildingAccess(user, building.id)) errors.push("No tienes permisos para usar ese edificio.");

  let totalCents = 0;
  let consumptionTotalMilli = 0;
  try {
    totalCents = toCents(body.total_amount);
    if (totalCents <= 0) errors.push("El monto total debe ser mayor a cero.");
  } catch {
    errors.push("El monto total debe ser válido.");
  }

  try {
    consumptionTotalMilli = toMilliUnits(body.consumption_total);
    if (consumptionTotalMilli < 0) errors.push("El consumo total no puede ser negativo.");
  } catch {
    errors.push("El consumo total debe ser válido, con máximo 3 decimales.");
  }

  const duplicate = db.prepare("SELECT id FROM receipts WHERE receipt_number = ? AND id != ?").get(cleanText(body.receipt_number, 80), id);
  if (duplicate) errors.push("Ya existe un recibo con ese número.");
  return { errors: [...new Set(errors)], totalCents, consumptionTotalMilli };
}

router.get("/", (req, res) => {
  const access = buildingFilter(req.currentUser, "r.building_id", "WHERE");
  const receipts = db.prepare(`
    SELECT r.*, b.name AS building_name
    FROM receipts r
    LEFT JOIN buildings b ON r.building_id = b.id
    ${access.sql}
    ORDER BY r.due_date DESC, r.id DESC
  `).all(...access.params);
  res.render("receipts/index", { receipts });
});

router.get("/new", (req, res) => {
  res.render("receipts/form", {
    title: "Nuevo recibo",
    receipt: { building_id: Number(req.query.building_id) || "" },
    buildings: activeBuildings(req.currentUser),
    errors: []
  });
});

router.post("/", (req, res) => {
  const { errors, totalCents, consumptionTotalMilli } = validateReceipt(req.body, req.currentUser);
  if (errors.length) {
    return res.status(400).render("receipts/form", {
      title: "Nuevo recibo",
      receipt: req.body,
      buildings: activeBuildings(req.currentUser, Number(req.body.building_id)),
      errors
    });
  }
  db.prepare(`
    INSERT INTO receipts (building_id, service_type, receipt_number, period, issue_date, due_date, total_amount_cents, consumption_total_milli, consumption_unit, description, file_reference, created_by, updated_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    Number(req.body.building_id),
    req.body.service_type,
    cleanText(req.body.receipt_number, 80),
    cleanText(req.body.period, 80),
    req.body.issue_date,
    req.body.due_date,
    totalCents,
    consumptionTotalMilli,
    consumptionUnitFor(req.body.service_type),
    cleanText(req.body.description, 1000),
    cleanText(req.body.file_reference, 255),
    req.currentUser.id,
    req.currentUser.id
  );
  redirectWith(res, "/receipts", "Recibo creado correctamente.");
});

router.get("/:id", (req, res) => {
  const receipt = db.prepare(`
    SELECT r.*, b.name AS building_name
    FROM receipts r
    LEFT JOIN buildings b ON r.building_id = b.id
    WHERE r.id = ?
  `).get(req.params.id);
  if (!receipt) return res.status(404).render("error", { title: "No encontrado", message: "Recibo no encontrado." });
  if (!ensureBuildingAccess(req, res, receipt.building_id)) return;
  const allocations = db.prepare(`
    SELECT a.*, o.full_name, o.floor, o.unit
    FROM receipt_allocations a
    JOIN occupants o ON a.occupant_id = o.id
    WHERE a.receipt_id = ?
    ORDER BY CAST(o.floor AS INTEGER), o.floor, o.unit, o.full_name
  `).all(req.params.id);
  const floorIndex = new Map();
  const allocationsByFloor = allocations.reduce((floors, allocation) => {
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
  res.render("receipts/detail", { receipt, allocationsByFloor });
});

router.get("/:id/edit", (req, res) => {
  const receipt = db.prepare("SELECT * FROM receipts WHERE id = ?").get(req.params.id);
  if (!receipt) return res.status(404).render("error", { title: "No encontrado", message: "Recibo no encontrado." });
  if (!ensureBuildingAccess(req, res, receipt.building_id)) return;
  res.render("receipts/form", { title: "Editar recibo", receipt, buildings: activeBuildings(req.currentUser, receipt.building_id || 0), errors: [] });
});

router.put("/:id", (req, res) => {
  const receipt = db.prepare("SELECT * FROM receipts WHERE id = ?").get(req.params.id);
  if (!receipt) return res.status(404).render("error", { title: "No encontrado", message: "Recibo no encontrado." });
  if (!ensureBuildingAccess(req, res, receipt.building_id)) return;
  const { errors, totalCents, consumptionTotalMilli } = validateReceipt(req.body, req.currentUser, Number(req.params.id));
  const allocations = db.prepare("SELECT COUNT(*) AS total FROM receipt_allocations WHERE receipt_id = ?").get(req.params.id).total;
  if (allocations > 0 && totalCents !== receipt.total_amount_cents) errors.push("No se puede cambiar el monto de un recibo ya prorrateado.");
  if (allocations > 0 && consumptionTotalMilli !== receipt.consumption_total_milli) errors.push("No se puede cambiar el consumo total de un recibo ya prorrateado.");
  if (allocations > 0 && Number(req.body.building_id) !== Number(receipt.building_id)) errors.push("No se puede cambiar el edificio de un recibo ya prorrateado.");

  if (errors.length) {
    return res.status(400).render("receipts/form", {
      title: "Editar recibo",
      receipt: { ...req.body, id: req.params.id, total_amount_cents: totalCents },
      buildings: activeBuildings(req.currentUser, Number(req.body.building_id)),
      errors
    });
  }

  db.prepare(`
    UPDATE receipts
    SET building_id = ?, service_type = ?, receipt_number = ?, period = ?, issue_date = ?, due_date = ?, total_amount_cents = ?, consumption_total_milli = ?, consumption_unit = ?, description = ?, file_reference = ?, updated_by = ?
    WHERE id = ?
  `).run(
    Number(req.body.building_id),
    req.body.service_type,
    cleanText(req.body.receipt_number, 80),
    cleanText(req.body.period, 80),
    req.body.issue_date,
    req.body.due_date,
    totalCents,
    consumptionTotalMilli,
    consumptionUnitFor(req.body.service_type),
    cleanText(req.body.description, 1000),
    cleanText(req.body.file_reference, 255),
    req.currentUser.id,
    req.params.id
  );
  redirectWith(res, `/receipts/${req.params.id}`, "Recibo actualizado correctamente.");
});

router.delete("/:id", (req, res) => {
  const receipt = db.prepare("SELECT building_id FROM receipts WHERE id = ?").get(req.params.id);
  if (!receipt) return res.status(404).render("error", { title: "No encontrado", message: "Recibo no encontrado." });
  if (!ensureBuildingAccess(req, res, receipt.building_id)) return;
  const payments = db.prepare(`
    SELECT COUNT(*) AS total
    FROM payments p
    JOIN receipt_allocations a ON p.allocation_id = a.id
    WHERE a.receipt_id = ?
  `).get(req.params.id).total;
  if (payments > 0) return redirectWith(res, `/receipts/${req.params.id}`, "No se puede eliminar un recibo con pagos asociados.", "danger");
  db.prepare("DELETE FROM receipts WHERE id = ?").run(req.params.id);
  redirectWith(res, "/receipts", "Recibo eliminado.");
});

module.exports = router;
