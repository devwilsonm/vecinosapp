const crypto = require("crypto");

const MAX_PUBLIC_LINK_TTL_HOURS = 24;
const DEFAULT_PUBLIC_LINK_TTL_HOURS = 24;

function parseDate(value) {
  if (value instanceof Date) return value;
  const text = String(value || "");
  const normalized = text.includes("T") || text.includes("GMT") ? text : `${text.replace(" ", "T")}Z`;
  return new Date(normalized);
}

function isPublicLinkExpired(link) {
  const explicitExpiration = parseDate(link.expires_at);
  if (!Number.isNaN(explicitExpiration.getTime())) return explicitExpiration.getTime() <= Date.now();
  const createdAt = parseDate(link.created_at);
  const baseTime = Number.isNaN(createdAt.getTime()) ? 0 : createdAt.getTime();
  return baseTime + MAX_PUBLIC_LINK_TTL_HOURS * 60 * 60 * 1000 <= Date.now();
}

async function publicLinkExpiration(database) {
  const setting = await database.prepare("SELECT value FROM app_settings WHERE key = ?").get("public_link_ttl_hours");
  const configuredHours = Number(setting?.value);
  const ttlHours = !Number.isFinite(configuredHours) || configuredHours <= 0
    ? DEFAULT_PUBLIC_LINK_TTL_HOURS
    : Math.min(configuredHours, MAX_PUBLIC_LINK_TTL_HOURS);
  const createdAt = new Date();
  return { createdAt, expiresAt: new Date(createdAt.getTime() + ttlHours * 60 * 60 * 1000) };
}

function createPublicToken() {
  return crypto.randomBytes(32).toString("hex");
}

module.exports = { createPublicToken, isPublicLinkExpired, publicLinkExpiration };