const express = require("express");
const { requirePermission } = require("../utils/access");
const { ensureBuildingAccess, hasBuildingAccess, permittedBuildingIds } = require("../utils/buildingAccess");
const { consumptionUnitFor, toMilliUnits } = require("../utils/consumption");
const { toCents } = require("../utils/money");
const { cleanText, isDate } = require("../utils/validation");
const { buildingRepository, receiptRepository } = require("../infrastructure/container");

const router = express.Router();

router.use(requirePermission("receipts.manage"));

const serviceLabels = { agua: "Agua", luz: "Luz", internet: "Internet", otro: "Otro" };
const serviceTypes = Object.keys(serviceLabels);

function redirectWith(res, url, message, type = "success") {
  res.redirect(`${url}?message=${encodeURIComponent(message)}&type=${type}`);
}

async function activeBuildings(user, selectedId = 0) {
  return buildingRepository.listActive(user.role_key === "super_admin" || user.role_key === "admin", permittedBuildingIds(user), selectedId);
}

async function validateReceipt(body, user, id = 0) {
  const errors = [];
  ["building_id", "service_type", "receipt_number", "period", "issue_date", "due_date", "total_amount"].forEach((field) => {
    if (!String(body[field] || "").trim()) errors.push("Completa todos los campos obligatorios.");
  });
  if (!["agua", "luz", "internet", "otro"].includes(body.service_type)) errors.push("Selecciona un tipo de servicio válido.");
  if (body.issue_date && !isDate(body.issue_date)) errors.push("La fecha de emisión no es válida.");
  if (body.due_date && !isDate(body.due_date)) errors.push("La fecha de vencimiento no es válida.");
  const building = await receiptRepository.findBuildingForValidation(Number(body.building_id));
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

  const duplicate = await receiptRepository.findDuplicateNumber(cleanText(body.receipt_number, 80), id);
  if (duplicate) errors.push("Ya existe un recibo con ese número.");
  return { errors: [...new Set(errors)], totalCents, consumptionTotalMilli };
}

router.get("/", async (req, res) => {
  const canAccessAll = req.currentUser.role_key === "super_admin" || req.currentUser.role_key === "admin";
  const buildingIds = permittedBuildingIds(req.currentUser);
  const currentYear = new Date().getFullYear();
  const requestedYear = String(req.query.year || currentYear);
  const selectedYear = requestedYear === "all" ? "all" : /^\d{4}$/.test(requestedYear) ? Number(requestedYear) : currentYear;
  const requestedService = String(req.query.service_type || "all");
  const selectedService = serviceTypes.includes(requestedService) ? requestedService : "all";
  const requestedBuildingId = Number(req.query.building_id) || 0;
  const selectedBuildingId = requestedBuildingId && hasBuildingAccess(req.currentUser, requestedBuildingId) ? requestedBuildingId : 0;
  const [receipts, buildings, availableYears] = await Promise.all([
    receiptRepository.listAccessible(canAccessAll, buildingIds, {
      buildingId: selectedBuildingId,
      serviceType: selectedService === "all" ? "" : selectedService,
      year: selectedYear === "all" ? 0 : selectedYear
    }),
    buildingRepository.listAccessible(canAccessAll, buildingIds),
    receiptRepository.listAccessibleYears(canAccessAll, buildingIds)
  ]);
  const years = [...new Set([currentYear, ...availableYears.map((item) => Number(item.year)).filter((year) => year > 0)])].sort((a, b) => b - a);
  const groups = new Map();
  receipts.forEach((receipt) => {
    const service = serviceLabels[receipt.service_type] ? receipt.service_type : "otro";
    let group = groups.get(service);
    if (!group) {
      group = { service, label: serviceLabels[service], receipts: [], total_amount_cents: 0 };
      groups.set(service, group);
    }
    group.receipts.push(receipt);
    group.total_amount_cents += Number(receipt.total_amount_cents || 0);
  });
  const receiptsByService = serviceTypes.filter((service) => groups.has(service)).map((service) => groups.get(service));
  res.render("receipts/index", {
    receiptsByService,
    receiptCount: receipts.length,
    buildings,
    years,
    selectedYear,
    selectedService,
    selectedBuildingId
  });
});

router.get("/new", async (req, res) => {
  res.render("receipts/form", {
    title: "Nuevo recibo",
    receipt: { building_id: Number(req.query.building_id) || "" },
    buildings: await activeBuildings(req.currentUser),
    errors: []
  });
});

router.get("/:id/duplicate", async (req, res) => {
  const receipt = await receiptRepository.findRawById(req.params.id);
  if (!receipt) return res.status(404).render("error", { title: "No encontrado", message: "Recibo no encontrado." });
  if (!ensureBuildingAccess(req, res, receipt.building_id)) return;
  const copy = { ...receipt };
  delete copy.id;
  copy.receipt_number = `${receipt.receipt_number || ""}-copia`.slice(0, 80);
  res.render("receipts/form", {
    title: "Duplicar recibo",
    receipt: copy,
    buildings: await activeBuildings(req.currentUser, receipt.building_id || 0),
    errors: []
  });
});

router.post("/", async (req, res) => {
  const { errors, totalCents, consumptionTotalMilli } = await validateReceipt(req.body, req.currentUser);
  if (errors.length) {
    return res.status(400).render("receipts/form", {
      title: "Nuevo recibo",
      receipt: req.body,
      buildings: await activeBuildings(req.currentUser, Number(req.body.building_id)),
      errors
    });
  }
  await receiptRepository.create({
    building_id: Number(req.body.building_id),
    service_type: req.body.service_type,
    receipt_number: cleanText(req.body.receipt_number, 80),
    period: cleanText(req.body.period, 80),
    issue_date: req.body.issue_date,
    due_date: req.body.due_date,
    total_amount_cents: totalCents,
    consumption_total_milli: consumptionTotalMilli,
    consumption_unit: consumptionUnitFor(req.body.service_type),
    description: cleanText(req.body.description, 1000),
    file_reference: cleanText(req.body.file_reference, 255)
  }, req.currentUser.id);
  redirectWith(res, "/receipts", "Recibo creado correctamente.");
});

router.get("/:id", async (req, res) => {
  const receipt = await receiptRepository.findById(req.params.id);
  if (!receipt) return res.status(404).render("error", { title: "No encontrado", message: "Recibo no encontrado." });
  if (!ensureBuildingAccess(req, res, receipt.building_id)) return;
  const allocations = await receiptRepository.listAllocations(req.params.id);
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

router.get("/:id/edit", async (req, res) => {
  const receipt = await receiptRepository.findRawById(req.params.id);
  if (!receipt) return res.status(404).render("error", { title: "No encontrado", message: "Recibo no encontrado." });
  if (!ensureBuildingAccess(req, res, receipt.building_id)) return;
  res.render("receipts/form", { title: "Editar recibo", receipt, buildings: await activeBuildings(req.currentUser, receipt.building_id || 0), errors: [] });
});

router.put("/:id", async (req, res) => {
  const receipt = await receiptRepository.findRawById(req.params.id);
  if (!receipt) return res.status(404).render("error", { title: "No encontrado", message: "Recibo no encontrado." });
  if (!ensureBuildingAccess(req, res, receipt.building_id)) return;
  const { errors, totalCents, consumptionTotalMilli } = await validateReceipt(req.body, req.currentUser, Number(req.params.id));
  const allocations = Number((await receiptRepository.countAllocations(req.params.id)).total);
  if (allocations > 0 && totalCents !== receipt.total_amount_cents) errors.push("No se puede cambiar el monto de un recibo ya prorrateado.");
  if (allocations > 0 && consumptionTotalMilli !== receipt.consumption_total_milli) errors.push("No se puede cambiar el consumo total de un recibo ya prorrateado.");
  if (allocations > 0 && Number(req.body.building_id) !== Number(receipt.building_id)) errors.push("No se puede cambiar el edificio de un recibo ya prorrateado.");

  if (errors.length) {
    return res.status(400).render("receipts/form", {
      title: "Editar recibo",
      receipt: { ...req.body, id: req.params.id, total_amount_cents: totalCents },
      buildings: await activeBuildings(req.currentUser, Number(req.body.building_id)),
      errors
    });
  }

  await receiptRepository.update(req.params.id, {
    building_id: Number(req.body.building_id),
    service_type: req.body.service_type,
    receipt_number: cleanText(req.body.receipt_number, 80),
    period: cleanText(req.body.period, 80),
    issue_date: req.body.issue_date,
    due_date: req.body.due_date,
    total_amount_cents: totalCents,
    consumption_total_milli: consumptionTotalMilli,
    consumption_unit: consumptionUnitFor(req.body.service_type),
    description: cleanText(req.body.description, 1000),
    file_reference: cleanText(req.body.file_reference, 255)
  }, req.currentUser.id);
  redirectWith(res, `/receipts/${req.params.id}`, "Recibo actualizado correctamente.");
});

router.delete("/:id", async (req, res) => {
  const receipt = await receiptRepository.findBuildingId(req.params.id);
  if (!receipt) return res.status(404).render("error", { title: "No encontrado", message: "Recibo no encontrado." });
  if (!ensureBuildingAccess(req, res, receipt.building_id)) return;
  const payments = Number((await receiptRepository.countPayments(req.params.id)).total);
  if (payments > 0) return redirectWith(res, `/receipts/${req.params.id}`, "No se puede eliminar un recibo con pagos asociados.", "danger");
  await receiptRepository.remove(req.params.id);
  redirectWith(res, "/receipts", "Recibo eliminado.");
});

module.exports = router;