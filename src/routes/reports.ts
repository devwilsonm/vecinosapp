const express = require("express");
const { requirePermission } = require("../utils/access");
const { canAccessAllBuildings } = require("../utils/access");
const { hasBuildingAccess, permittedBuildingIds } = require("../utils/buildingAccess");
const { buildingRepository, reportRepository } = require("../infrastructure/container");

const router = express.Router();

router.use(requirePermission("reports.view"));

const serviceLabels = { agua: "Agua", luz: "Luz", internet: "Internet", otro: "Otro" };
const serviceTypes = Object.keys(serviceLabels);
const serviceUnits = { agua: "m3", luz: "kW", internet: "unid.", otro: "unid." };

function validMonth(value, fallback) {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(String(value)) ? String(value) : fallback;
}

function nextMonth(month) {
  const year = Number(month.slice(0, 4));
  const monthNumber = Number(month.slice(5));
  return monthNumber === 12 ? `${year + 1}-01` : `${year}-${String(monthNumber + 1).padStart(2, "0")}`;
}

function monthRange(from, to) {
  const [fromYear, fromMonth] = from.split("-").map(Number);
  const [toYear, toMonth] = to.split("-").map(Number);
  const months = [];
  let year = fromYear;
  let month = fromMonth;
  while (year < toYear || (year === toYear && month <= toMonth)) {
    months.push(`${year}-${String(month).padStart(2, "0")}`);
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
  return months;
}

function monthLabel(month) {
  return new Intl.DateTimeFormat("es-PE", { month: "short", year: "numeric", timeZone: "UTC" })
    .format(new Date(`${month}-01T00:00:00Z`))
    .replace(".", "");
}

async function consumptionReportData(req) {
  const allBuildings = canAccessAllBuildings(req.currentUser);
  const buildingIds = permittedBuildingIds(req.currentUser);
  const currentYear = new Date().getFullYear();
  const defaultFrom = `${currentYear}-01`;
  const defaultTo = `${currentYear}-12`;
  let selectedFrom = validMonth(req.query.from, defaultFrom);
  let selectedTo = validMonth(req.query.to, defaultTo);
  if (selectedFrom > selectedTo) [selectedFrom, selectedTo] = [selectedTo, selectedFrom];
  const requestedService = String(req.query.service_type || "all");
  const selectedService = serviceTypes.includes(requestedService) ? requestedService : "all";
  const requestedBuildingId = Number(req.query.building_id) || 0;
  const selectedBuildingId = requestedBuildingId && hasBuildingAccess(req.currentUser, requestedBuildingId) ? requestedBuildingId : 0;
  const [consumptionRows, buildings] = await Promise.all([
    reportRepository.consumptionByMonth(allBuildings, buildingIds, {
      from: `${selectedFrom}-01`,
      to: `${nextMonth(selectedTo)}-01`,
      serviceType: selectedService === "all" ? "" : selectedService,
      buildingId: selectedBuildingId
    }),
    buildingRepository.listAccessible(allBuildings, buildingIds)
  ]);
  const months = monthRange(selectedFrom, selectedTo);
  const consumptionByService = new Map();
  consumptionRows.forEach((row) => {
    const service = serviceLabels[row.service_type] ? row.service_type : "otro";
    let group = consumptionByService.get(service);
    if (!group) {
      group = { service, label: serviceLabels[service], unit: row.consumption_unit || serviceUnits[service], values: new Map() };
      consumptionByService.set(service, group);
    }
    group.values.set(row.month, Number(row.consumption_milli || 0) / 1000);
  });
  const consumptionCharts = serviceTypes.filter((service) => consumptionByService.has(service)).map((service) => {
    const group = consumptionByService.get(service);
    return {
      service: group.service,
      label: group.label,
      unit: group.unit,
      data: months.map((month) => ({ category: monthLabel(month), value: group.values.get(month) || 0 }))
    };
  });
  return { consumptionCharts, buildings, selectedFrom, selectedTo, selectedService, selectedBuildingId };
}

router.get("/consumption", async (req, res) => {
  res.render("reports/consumption", await consumptionReportData(req));
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