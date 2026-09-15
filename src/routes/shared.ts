const express = require("express");
const { buildingRepository, publicAllocationRepository, publicReportRepository, reportRepository } = require("../infrastructure/container");
const { buildConsumptionCharts, nextMonth, serviceLabels, serviceTypes, serviceUnits } = require("../domain/reports/consumptionReport");

const router = express.Router();

async function allocationsByFloor(receiptId) {
  const allocations = await publicAllocationRepository.listAllocations(receiptId);
  const floorIndex = new Map();
  return allocations.reduce((floors, allocation) => {
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
}

router.get("/allocations/:token", async (req, res) => {
  const link = await publicAllocationRepository.findLinkByToken(req.params.token);
  if (!link) return res.status(404).render("error", { title: "Enlace no válido", message: "El enlace público no existe o ya no está disponible." });
  if (publicAllocationRepository.isLinkExpired(link)) {
    return res.status(404).render("error", { title: "Enlace expirado", message: "El enlace público expiró. Solicita uno nuevo." });
  }

  const receipt = await publicAllocationRepository.findReceipt(link.receipt_id);
  if (!receipt) return res.status(404).render("error", { title: "No encontrado", message: "El prorrateo ya no está disponible." });

  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Robots-Tag", "noindex, nofollow, noarchive");
  res.render("allocations/shared", {
    receipt,
    allocationsByFloor: await allocationsByFloor(receipt.id),
    sharePath: req.originalUrl
  });
});

router.get("/reports/consumption/:token", async (req, res) => {
  const token = String(req.params.token || "");
  if (!/^[a-f0-9]{64}$/.test(token)) return res.status(404).render("error", { title: "Enlace no válido", message: "El enlace público no existe o ya no está disponible." });
  const link = await publicReportRepository.findLinkByToken(token);
  if (!link) return res.status(404).render("error", { title: "Enlace no válido", message: "El enlace público no existe o ya no está disponible." });
  if (publicReportRepository.isLinkExpired(link)) {
    return res.status(404).render("error", { title: "Enlace expirado", message: "El enlace público expiró. Solicita uno nuevo." });
  }

  let buildingIds = [];
  try {
    buildingIds = JSON.parse(String(link.building_ids || "[]"))
      .map(Number)
      .filter((id, index, ids) => Number.isInteger(id) && id > 0 && ids.indexOf(id) === index);
  } catch {
    return res.status(404).render("error", { title: "Enlace no válido", message: "El enlace público no existe o ya no está disponible." });
  }
  const serviceType = serviceTypes.includes(String(link.service_type)) ? String(link.service_type) : "all";
  const [rows, buildings] = await Promise.all([
    reportRepository.consumptionByMonth(false, buildingIds, {
      from: `${link.from_month}-01`,
      to: `${nextMonth(link.to_month)}-01`,
      serviceType: serviceType === "all" ? "" : serviceType,
      buildingId: 0
    }),
    buildingRepository.listAccessible(false, buildingIds)
  ]);
  const expiresAt = new Date(link.expires_at);
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Robots-Tag", "noindex, nofollow, noarchive");
  res.render("reports/consumption-shared", {
    consumptionCharts: buildConsumptionCharts(rows, link.from_month, link.to_month),
    selectedFrom: link.from_month,
    selectedTo: link.to_month,
    selectedService: serviceType,
    serviceLabel: serviceType === "all" ? "Todos los servicios" : serviceLabels[serviceType],
    serviceUnit: serviceType === "all" ? "" : serviceUnits[serviceType],
    buildingLabel: buildings.length === 1 ? buildings[0].name : "Edificios seleccionados",
    shareExpiresAt: Number.isNaN(expiresAt.getTime()) ? "" : expiresAt.toISOString()
  });
});

module.exports = router;