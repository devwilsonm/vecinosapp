const express = require("express");
const { db } = require("../db");
const { requirePermission } = require("../utils/access");
const { activeBuildingsForUser, ensureBuildingAccess, hasBuildingAccess } = require("../utils/buildingAccess");
const { toCents } = require("../utils/money");
const { updateAllocationStatus, updateReceiptStatus } = require("../utils/status");
const { cleanText, isDate } = require("../utils/validation");

const router = express.Router();

router.use(requirePermission("payments.manage"));

function redirectWith(res, url, message, type = "success") {
  res.redirect(`${url}?message=${encodeURIComponent(message)}&type=${type}`);
}

router.get("/", (req, res) => {
  const requestedBuildingId = Number(req.query.building_id) || 0;
  const buildings = activeBuildingsForUser(db, req.currentUser, requestedBuildingId);
  const selectedBuildingId = requestedBuildingId && hasBuildingAccess(req.currentUser, requestedBuildingId)
    ? requestedBuildingId
    : buildings[0]?.id || 0;
  const pendingAllocations = db.prepare(`
    SELECT a.*, o.full_name, o.floor, o.unit, r.receipt_number, r.period, b.name AS building_name
    FROM receipt_allocations a
    JOIN occupants o ON a.occupant_id = o.id
    JOIN receipts r ON a.receipt_id = r.id
    JOIN buildings b ON r.building_id = b.id
    WHERE a.balance_cents > 0
      AND r.building_id = ?
    ORDER BY CAST(o.floor AS INTEGER), o.floor, o.unit, o.full_name, r.due_date
  `).all(selectedBuildingId);
  const payments = db.prepare(`
    SELECT p.*, o.full_name, o.floor, o.unit, r.receipt_number, r.period, b.name AS building_name
    FROM payments p
    JOIN receipt_allocations a ON p.allocation_id = a.id
    JOIN occupants o ON a.occupant_id = o.id
    JOIN receipts r ON a.receipt_id = r.id
    JOIN buildings b ON r.building_id = b.id
    WHERE r.building_id = ?
    ORDER BY p.payment_date DESC, p.id DESC
  `).all(selectedBuildingId);

  const groupByFloor = (rows) => rows.reduce((groups, row) => {
    const key = row.floor || "Sin piso";
    if (!groups[key]) groups[key] = [];
    groups[key].push(row);
    return groups;
  }, {});

  res.render("payments/index", {
    buildings,
    selectedBuildingId,
    pendingByFloor: groupByFloor(pendingAllocations),
    paymentsByFloor: groupByFloor(payments)
  });
});

router.get("/new/:allocationId", (req, res) => {
  const allocation = db.prepare(`
    SELECT a.*, o.full_name, r.receipt_number, r.period, r.id AS receipt_id, r.building_id
    FROM receipt_allocations a
    JOIN occupants o ON a.occupant_id = o.id
    JOIN receipts r ON a.receipt_id = r.id
    WHERE a.id = ?
  `).get(req.params.allocationId);
  if (!allocation) return res.status(404).render("error", { title: "No encontrado", message: "Deuda no encontrada." });
  if (!ensureBuildingAccess(req, res, allocation.building_id)) return;
  res.render("payments/form", { allocation, errors: [] });
});

router.post("/new/:allocationId", (req, res) => {
  const allocation = db.prepare(`
    SELECT a.*, o.full_name, r.receipt_number, r.period, r.id AS receipt_id, r.building_id
    FROM receipt_allocations a
    JOIN occupants o ON a.occupant_id = o.id
    JOIN receipts r ON a.receipt_id = r.id
    WHERE a.id = ?
  `).get(req.params.allocationId);
  if (!allocation) return res.status(404).render("error", { title: "No encontrado", message: "Deuda no encontrada." });
  if (!ensureBuildingAccess(req, res, allocation.building_id)) return;

  const errors = [];
  let amountCents = 0;
  try {
    amountCents = toCents(req.body.amount);
    if (amountCents <= 0) errors.push("El monto pagado debe ser mayor a cero.");
    if (amountCents > allocation.balance_cents) errors.push("El pago no puede ser mayor al saldo pendiente.");
  } catch {
    errors.push("El monto pagado debe ser válido.");
  }
  if (!req.body.payment_date || !isDate(req.body.payment_date)) errors.push("La fecha de pago es obligatoria y debe ser válida.");
  if (!["efectivo", "transferencia", "yape/plin", "otro"].includes(req.body.payment_method)) errors.push("El método de pago es obligatorio.");

  if (errors.length) return res.status(400).render("payments/form", { allocation, errors });

  db.prepare(`
    INSERT INTO payments (allocation_id, amount_cents, payment_date, payment_method, note, created_by)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(allocation.id, amountCents, req.body.payment_date, req.body.payment_method, cleanText(req.body.note, 1000), req.currentUser.id);
  updateAllocationStatus(allocation.id);
  db.prepare("UPDATE receipt_allocations SET updated_by = ? WHERE id = ?").run(req.currentUser.id, allocation.id);
  updateReceiptStatus(allocation.receipt_id);
  db.prepare("UPDATE receipts SET updated_by = ? WHERE id = ?").run(req.currentUser.id, allocation.receipt_id);
  redirectWith(res, "/payments", "Pago registrado correctamente.");
});

module.exports = router;
