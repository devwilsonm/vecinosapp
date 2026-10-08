const { servicesForBuildings } = require("../utils/services");
const { serviceLabels } = require("../domain/reports/consumptionReport");
const express = require("express");
const { requirePermission } = require("../utils/access");
const { canAccessAllBuildings } = require("../utils/access");
const { hasBuildingAccess, permittedBuildingIds } = require("../utils/buildingAccess");
const { buildingRepository, occupantRepository, publicReportRepository, reportRepository } = require("../infrastructure/container");
const { buildConsumptionCharts, nextMonth, normalizeConsumptionFilters } = require("../domain/reports/consumptionReport");

const router = express.Router();

router.use(requirePermission("reports.view"));

router.get("/occupant-debts", async (req, res) => {
  const allBuildings = canAccessAllBuildings(req.currentUser);
  const buildingIds = permittedBuildingIds(req.currentUser);
  const occupants = (await occupantRepository.listAccessible(allBuildings, buildingIds)).filter((row) => row.is_active === 1);
  const selectedOccupantId = Number(req.query.occupant_id || 0);
  const occupant = occupants.find((row) => Number(row.id) === selectedOccupantId);
  if (req.query.occupant_id && (!Number.isSafeInteger(selectedOccupantId) || !occupant)) {
    return res.status(404).send("Ocupante no disponible.");
  }
  const calendar = new Intl.DateTimeFormat("en", { timeZone: "America/Lima", year: "numeric", month: "2-digit" }).formatToParts(new Date());
  const year = Number(calendar.find((part) => part.type === "year").value);
  const month = Number(calendar.find((part) => part.type === "month").value);
  const recentFrom = new Date(Date.UTC(year, month - 6, 1)).toISOString().slice(0, 7);
  const recentTo = `${year}-${String(month).padStart(2, "0")}`;
  const [debts, assignedRows] = occupant ? await Promise.all([
    reportRepository.pendingDebtsForOccupant(allBuildings, buildingIds, selectedOccupantId),
    reportRepository.assignedAmountsForOccupant(allBuildings, buildingIds, selectedOccupantId)
  ]) : [[], []];
  const monthNames = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
  const assignmentsByMonth = new Map<string, typeof assignedRows>();
  let latestAssignedMonth = "";
  for (const row of assignedRows) {
    const period = String(row.period || "").trim().toLowerCase().replace("setiembre", "septiembre");
    const namedPeriod = period.match(/^([a-z]+)\s+(\d{4})$/);
    const numericPeriod = period.match(/^(0[1-9]|1[0-2])[\/-](\d{4})$/);
    const monthNumber = namedPeriod ? monthNames.indexOf(namedPeriod[1]) + 1 : 0;
    const periodMonth = /^\d{4}-(0[1-9]|1[0-2])$/.test(period) ? period
      : monthNumber ? `${namedPeriod[2]}-${String(monthNumber).padStart(2, "0")}`
      : numericPeriod ? `${numericPeriod[2]}-${numericPeriod[1]}` : row.issue_month;
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(periodMonth) || periodMonth > recentTo) continue;
    let rows = assignmentsByMonth.get(periodMonth);
    if (!rows) {
      rows = [];
      assignmentsByMonth.set(periodMonth, rows);
    }
    rows.push(row);
    if (periodMonth >= recentFrom && periodMonth > latestAssignedMonth) latestAssignedMonth = periodMonth;
  }
  const lastMonth = latestAssignedMonth ? new Date(`${latestAssignedMonth}-01T00:00:00Z`) : null;
  const months = lastMonth ? Array.from({ length: 6 }, (_, index) => new Date(Date.UTC(lastMonth.getUTCFullYear(), lastMonth.getUTCMonth() - 5 + index, 1)).toISOString().slice(0, 7)) : [];
  const evolutionFrom = months[0] || recentFrom;
  const evolutionTo = latestAssignedMonth || recentTo;
  const monthFormatter = new Intl.DateTimeFormat("es-PE", { month: "short", year: "numeric", timeZone: "UTC" });
  const labels = months.map((value) => monthFormatter.format(new Date(`${value}-01T00:00:00Z`)).replace(".", ""));
  const services = new Map();
  months.forEach((periodMonth, index) => {
    for (const row of assignmentsByMonth.get(periodMonth) || []) {
      let report = services.get(row.service_type);
      if (!report) {
        report = { service: row.service_type, label: serviceLabels[row.service_type] || row.service_type, unit: "S/", data: labels.map((category) => ({ category, value: 0 })) };
        services.set(row.service_type, report);
      }
      report.data[index].value += Number(row.amount_cents);
    }
  });
  const evolutionCharts = [...services.values()].sort((a, b) => Number(a.service === "otro") - Number(b.service === "otro"));
  for (const report of evolutionCharts) for (const point of report.data) point.value /= 100;
  const periods = [];
  const periodIndex = new Map();
  let totalBalanceCents = 0;
  for (const debt of debts) {
    let group = periodIndex.get(debt.period);
    if (!group) {
      group = { period: debt.period, receipts: [], balance_cents: 0 };
      periodIndex.set(debt.period, group);
      periods.push(group);
    }
    debt.balance_cents = Number(debt.balance_cents);
    group.receipts.push(debt);
    group.balance_cents += debt.balance_cents;
    totalBalanceCents += debt.balance_cents;
  }
  res.render("reports/occupant-debts", { occupants, selectedOccupantId, occupant, periods, totalBalanceCents, serviceLabels, evolutionCharts, evolutionFrom, evolutionTo });
});

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
  const services = await servicesForBuildings(buildings);
  const serviceOptions = [...new Set<string>(services.map((service) => String(service.name)))].map((value) => ({ value, label: serviceLabels[value] || value }));
  return { serviceOptions, ...filters, consumptionCharts: buildConsumptionCharts(consumptionRows, filters.selectedFrom, filters.selectedTo), buildings, sharePath: null };
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
  res.render("reports/index", { debtsByFloor, pendingReceipts, paymentsByPeriod, receiptTotals, serviceLabels });
});

module.exports = router;