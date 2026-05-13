function toCents(value) {
  if (value === undefined || value === null || value === "") return 0;
  const normalized = String(value).replace(",", ".").trim();
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) {
    throw new Error("Monto inválido");
  }
  return Math.round(Number(normalized) * 100);
}

function formatCents(cents) {
  return (Number(cents || 0) / 100).toFixed(2);
}

function splitAmount(totalCents, count) {
  const base = Math.floor(totalCents / count);
  const remainder = totalCents - base * count;
  return Array.from({ length: count }, (_, index) => base + (index === count - 1 ? remainder : 0));
}

module.exports = { toCents, formatCents, splitAmount };
