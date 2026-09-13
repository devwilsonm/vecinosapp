const express = require("express");
const { requirePermission } = require("../utils/access");
const { ensureBuildingAccess, hasBuildingAccess, permittedBuildingIds } = require("../utils/buildingAccess");
const { toCents } = require("../utils/money");
const { cleanText, isDate } = require("../utils/validation");
const { allocationRepository, buildingRepository, paymentRepository } = require("../infrastructure/container");

const router = express.Router();

type MassPaymentFormState = {
  allocationIds?: number[];
  errors?: string[];
  payment_date?: string;
  payment_method?: string;
  note?: string;
};

router.use(requirePermission("payments.manage"));

function redirectWith(res, url, message, type = "success") {
  const separator = url.includes("?") ? "&" : "?";
  res.redirect(`${url}${separator}message=${encodeURIComponent(message)}&type=${type}`);
}

function todayForInput() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseIds(value) {
  return [...new Set((Array.isArray(value) ? value : value ? [value] : [])
    .map(Number)
    .filter((id) => Number.isInteger(id) && id > 0))];
}

async function massPaymentFormData(buildingId, floor, state: MassPaymentFormState = {}) {
  const [building, allocations] = await Promise.all([
    buildingRepository.findById(buildingId),
    paymentRepository.listPendingByFloor(buildingId, floor)
  ]);
  const selectedIds = state.allocationIds || allocations.map((allocation) => Number(allocation.id));
  return {
    building,
    floor,
    allocations,
    selectedIds: new Set(selectedIds),
    errors: state.errors || [],
    formData: {
      payment_date: state.payment_date || todayForInput(),
      payment_method: state.payment_method || "",
      note: state.note || ""
    }
  };
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

router.get("/mass/new", async (req, res) => {
  const buildingId = Number(req.query.building_id) || 0;
  const floor = cleanText(req.query.floor, 100);
  const building = await buildingRepository.findById(buildingId);
  if (!building || !floor) return res.status(404).render("error", { title: "No encontrado", message: "No se encontró el edificio o piso solicitado." });
  if (!ensureBuildingAccess(req, res, building.id)) return;
  res.render("payments/mass-form", await massPaymentFormData(buildingId, floor));
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

router.post("/mass", async (req, res) => {
  const buildingId = Number(req.body.building_id) || 0;
  const floor = cleanText(req.body.floor, 100);
  const building = await buildingRepository.findById(buildingId);
  if (!building || !floor) return res.status(400).render("error", { title: "Solicitud inválida", message: "El edificio y el piso son obligatorios." });
  if (!ensureBuildingAccess(req, res, building.id)) return;

  const requestedIds = parseIds(req.body.allocation_ids);
  const pending = await paymentRepository.listPendingByFloor(buildingId, floor);
  const selected = pending.filter((allocation) => requestedIds.includes(Number(allocation.id)));
  const errors = [];
  if (!selected.length) errors.push("Selecciona al menos una deuda pendiente.");
  if (selected.length !== requestedIds.length) errors.push("Una o más deudas ya no están pendientes. Actualiza la página e inténtalo nuevamente.");
  if (!req.body.payment_date || !isDate(req.body.payment_date)) errors.push("La fecha de pago es obligatoria y debe ser válida.");
  if (!["efectivo", "transferencia", "yape/plin", "otro"].includes(req.body.payment_method)) errors.push("El método de pago es obligatorio.");

  if (errors.length) {
    return res.status(400).render("payments/mass-form", await massPaymentFormData(buildingId, floor, {
      allocationIds: requestedIds,
      payment_date: req.body.payment_date,
      payment_method: req.body.payment_method,
      note: req.body.note,
      errors
    }));
  }

  const input = selected.map((allocation) => ({
    allocation_id: Number(allocation.id),
    amount_cents: Number(allocation.balance_cents),
    payment_date: req.body.payment_date,
    payment_method: req.body.payment_method,
    note: cleanText(req.body.note, 1000)
  }));
  await paymentRepository.createMany(input, req.currentUser.id);
  redirectWith(res, `/payments?building_id=${buildingId}`, `${selected.length} pagos registrados correctamente.`);
});

module.exports = router;