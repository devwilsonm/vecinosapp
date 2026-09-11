function asPositiveInteger(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 0;
}

function cleanText(value, maxLength = 255) {
  return String(value || "").trim().slice(0, maxLength);
}

function isDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""));
}

module.exports = { asPositiveInteger, cleanText, isDate };
