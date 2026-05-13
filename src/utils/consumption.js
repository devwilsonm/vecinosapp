function toMilliUnits(value) {
  const normalized = String(value || "").trim().replace(",", ".");
  if (!normalized) return 0;
  if (!/^\d+(\.\d{1,3})?$/.test(normalized)) throw new Error("Invalid consumption");
  return Math.round(Number(normalized) * 1000);
}

function formatMilliUnits(value) {
  return (Number(value || 0) / 1000).toFixed(3).replace(/\.?0+$/, "");
}

function consumptionUnitFor(serviceType) {
  if (serviceType === "luz") return "kW";
  if (serviceType === "agua") return "m3";
  return "unid.";
}

module.exports = { consumptionUnitFor, formatMilliUnits, toMilliUnits };
