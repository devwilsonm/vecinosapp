function statusClass(status = "") {
  const normalized = String(status).toLowerCase();
  if (normalized === "pagado") return "status-paid";
  if (normalized === "pagado parcialmente" || normalized === "pagado parcial") return "status-partial";
  if (normalized === "pendiente") return "status-pending";
  if (normalized === "prorrateado") return "status-allocated";
  return "status-neutral";
}

module.exports = { statusClass };
