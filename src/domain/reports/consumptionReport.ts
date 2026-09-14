export const serviceLabels = { agua: "Agua", luz: "Luz", internet: "Internet", otro: "Otro" };
export const serviceTypes = Object.keys(serviceLabels);
export const serviceUnits = { agua: "m3", luz: "kW", internet: "unid.", otro: "unid." };

function validMonth(value, fallback) {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(String(value)) ? String(value) : fallback;
}

export function nextMonth(month) {
  const year = Number(month.slice(0, 4));
  const monthNumber = Number(month.slice(5));
  return monthNumber === 12 ? `${year + 1}-01` : `${year}-${String(monthNumber + 1).padStart(2, "0")}`;
}

function monthValue(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export function defaultConsumptionRange(referenceDate = new Date()) {
  const end = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), 1);
  const start = new Date(end.getFullYear(), end.getMonth() - 11, 1);
  return { from: monthValue(start), to: monthValue(end) };
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

export function normalizeConsumptionFilters(source, referenceDate, buildingAllowed) {
  const defaultRange = defaultConsumptionRange(referenceDate);
  const defaultFrom = defaultRange.from;
  const defaultTo = defaultRange.to;
  let selectedFrom = validMonth(source.from, defaultFrom);
  let selectedTo = validMonth(source.to, defaultTo);
  if (selectedFrom > selectedTo) [selectedFrom, selectedTo] = [selectedTo, selectedFrom];
  const requestedService = String(source.service_type || "all");
  const selectedService = serviceTypes.includes(requestedService) ? requestedService : "all";
  const requestedBuildingId = Number(source.building_id) || 0;
  const selectedBuildingId = requestedBuildingId && buildingAllowed(requestedBuildingId) ? requestedBuildingId : 0;
  return { selectedFrom, selectedTo, selectedService, selectedBuildingId };
}

export function buildConsumptionCharts(rows, selectedFrom, selectedTo) {
  const months = monthRange(selectedFrom, selectedTo);
  const consumptionByService = new Map();
  rows.forEach((row) => {
    const service = serviceLabels[row.service_type] ? row.service_type : "otro";
    let group = consumptionByService.get(service);
    if (!group) {
      group = { service, label: serviceLabels[service], unit: row.consumption_unit || serviceUnits[service], values: new Map() };
      consumptionByService.set(service, group);
    }
    group.values.set(row.month, Number(row.consumption_milli || 0) / 1000);
  });
  return serviceTypes.filter((service) => consumptionByService.has(service)).map((service) => {
    const group = consumptionByService.get(service);
    return {
      service: group.service,
      label: group.label,
      unit: group.unit,
      data: months.map((month) => ({ category: monthLabel(month), value: group.values.get(month) || 0 }))
    };
  });
}

module.exports = { buildConsumptionCharts, defaultConsumptionRange, nextMonth, normalizeConsumptionFilters, serviceLabels, serviceTypes, serviceUnits };