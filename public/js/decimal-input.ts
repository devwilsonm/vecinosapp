// @ts-nocheck
export {};

function sanitizeDecimal(value) {
  const normalized = value.replace(",", ".");
  const cleaned = normalized.replace(/[^\d.]/g, "");
  const parts = cleaned.split(".");
  if (parts.length === 1) return parts[0];
  return `${parts[0]}.${parts.slice(1).join("").slice(0, 3)}`;
}

document.querySelectorAll("[data-decimal-input]").forEach((input) => {
  input.addEventListener("input", () => {
    const sanitized = sanitizeDecimal(input.value);
    if (input.value !== sanitized) input.value = sanitized;
  });
});