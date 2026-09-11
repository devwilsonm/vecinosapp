const express = require("express");
const { requirePermission } = require("../utils/access");
const { ensureBuildingAccess, hasBuildingAccess, permittedBuildingIds } = require("../utils/buildingAccess");
const { toCents } = require("../utils/money");
const { cleanText, isDate } = require("../utils/validation");
const { allocationRepository, buildingRepository, paymentRepository } = require("../infrastructure/container");

const router = express.Router();

router.use(requirePermission("payments.manage"));

function redirectWith(res, url, message, type = "success") {
  res.redirect(`${url}?message=${encodeURIComponent(message)}&type=${type}`);
}

function todayForInput() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

router.get("/", async (req, res) => {
  const requestedBuildingId = Number(req.query.building_id) || 0;
  const buildings = await buildingRepository.listActive(req.currentUser.role_key === "super_admin" || req.currentUser.role_key === "admin", permittedBuildingIds(req.currentUser), requestedBuildingId);
  const selectedBuildingId = requestedBuildingId && hasBuildingAccess(req.currentUser, requestedBuildingId)
    ? requestedBuildingId
    : buildings[0]?.id || 0;
  const [pendingAllocations, payments] = await Promise.all([
    paymentRepository.listPendingByBuilding(selectedBuildingId),
    paymentRepository.listByBuilding(selectedBuildingId)
  ]);

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

router.get("/new/:allocationId", async (req, res) => {
  const allocation = await paymentRepository.findAllocation(req.params.allocationId);
  if (!allocation) return res.status(404).render("error", { title: "No encontrado", message: "Deuda no encontrada." });
  if (!ensureBuildingAccess(req, res, allocation.building_id)) return;
  res.render("payments/form", {
    allocation,
    errors: [],
    formData: { amount: (allocation.balance_cents / 100).toFixed(2), payment_date: todayForInput() }
  });
});

router.post("/new/:allocationId", async (req, res) => {
  const allocation = await paymentRepository.findAllocation(req.params.allocationId);
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

  if (errors.length) return res.status(400).render("payments/form", { allocation, errors, formData: req.body });

  await paymentRepository.create({ allocation_id: allocation.id, amount_cents: amountCents, payment_date: req.body.payment_date, payment_method: req.body.payment_method, note: cleanText(req.body.note, 1000) }, req.currentUser.id);
  await allocationRepository.updateAllocationStatus(allocation.id);
  await paymentRepository.markAllocationUpdated(allocation.id, req.currentUser.id);
  await allocationRepository.updateReceiptStatus(allocation.receipt_id);
  await paymentRepository.markReceiptUpdated(allocation.receipt_id, req.currentUser.id);
  redirectWith(res, "/payments", "Pago registrado correctamente.");
});

module.exports = router;
