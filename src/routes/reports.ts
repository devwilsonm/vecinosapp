const express = require("express");
const { requirePermission } = require("../utils/access");
const { canAccessAllBuildings } = require("../utils/access");
const { hasBuildingAccess, permittedBuildingIds } = require("../utils/buildingAccess");
const { buildingRepository, publicReportRepository, reportRepository } = require("../infrastructure/container");
const { buildConsumptionCharts, nextMonth, normalizeConsumptionFilters } = require("../domain/reports/consumptionReport");

const router = express.Router();

router.use(requirePermission("reports.view"));

async function consumptionReportData(req, source = req.query, scope: Record<string, any> = {}) {
  const allBuildings = scope.allBuildings ?? canAccessAllBuildings(req.currentUser);
  const buildingIds = scope.buildingIds ?? permittedBuildingIds(req.currentUser);
  const filters = normalizeConsumptionFilters(source, new Date(), (buildingId) => allBuildings || hasBuildingAccess(req.currentUser, buildingId) || buildingIds.includes(buildingId));
  const [consumptionRows, buildings] = await Promise.all([
    reportRepository.consumptionByMonth(allBuildings, buildingIds, {
      from: `${filters.selectedFrom}-01`,
      to: `${nextMonth(filters.selectedTo)}-01`,
      serviceType: filters.selectedService === "all" ? "" : filters.selectedService,
      buildingId: filters.selectedBuildingId
    }),
    buildingRepository.listAccessible(allBuildings, buildingIds)
  ]);
  return { ...filters, consumptionCharts: buildConsumptionCharts(consumptionRows, filters.selectedFrom, filters.selectedTo), buildings, sharePath: null };
}

router.get("/consumption", async (req, res) => {
  res.render("reports/consumption", await consumptionReportData(req));
});

router.post("/consumption/share", async (req, res) => {
  const data = await consumptionReportData(req, req.body);
  const buildingIds = data.selectedBuildingId
    ? [data.selectedBuildingId]
    : data.buildings.map((building) => Number(building.id)).filter(Boolean);
  const link = await publicReportRepository.createLink({
    fromMonth: data.selectedFrom,
    toMonth: data.selectedTo,
    serviceType: data.selectedService,
    buildingIds
  });
  res.render("reports/consumption", { ...data, sharePath: `/shared/reports/consumption/${link.token}`, shareExpiresAt: link.expiresAt });
});

router.get("/", async (req, res) => {
  const allBuildings = canAccessAllBuildings(req.currentUser);
  const buildingIds = permittedBuildingIds(req.currentUser);
  const [debtsByOccupant, pendingReceipts, paymentsByPeriod, receiptTotals] = await Promise.all([
    reportRepository.debtsByOccupant(allBuildings, buildingIds),
    reportRepository.pendingReceipts(allBuildings, buildingIds),
    reportRepository.paymentsByPeriod(allBuildings, buildingIds),
    reportRepository.receiptTotals(allBuildings, buildingIds)
  ]);
  const floorIndex = new Map();
  const debtsByFloor = debtsByOccupant.reduce((floors, debt) => {
    const floorKey = debt.floor || "Sin piso";
    let group = floorIndex.get(floorKey);
    if (!group) {
      group = { floor: floorKey, occupants: [], balance_cents: 0 };
      floorIndex.set(floorKey, group);
      floors.push(group);
    }
    group.occupants.push(debt);
    debt.balance_cents = Number(debt.balance_cents || 0);
    group.balance_cents += debt.balance_cents;
    return floors;
  }, []);
  res.render("reports/index", { debtsByFloor, pendingReceipts, paymentsByPeriod, receiptTotals });
});

module.exports = router;