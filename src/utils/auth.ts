const crypto = require("crypto");

const COOKIE_NAME = "vecinosapp_session";
const SECRET = process.env.SESSION_SECRET || (process.env.NODE_ENV === "production"
  ? (() => { throw new Error("SESSION_SECRET es obligatorio en producción."); })()
  : "vecinosapp-local-session-secret-change-me");
const MAX_AGE_SECONDS = 60 * 20;
const SESSION_CACHE_TTL_MS = 60_000;
const MAX_CACHED_SESSIONS = 1000;
const sessionUsers = new Map();
let sessionCacheVersion = 0;

async function loadSessionUser(userId, repository) {
  const user = await repository.findSessionUser(userId);
  if (!user) return null;
  [user.permissions, user.building_ids] = await Promise.all([
    repository.listPermissionKeys(user.role_id),
    repository.listBuildingIds(user.id)
  ]);
  return user;
}

function storeSessionUser(key, userId, user, expiresAt) {
  const now = Date.now();
  for (const [entryKey, entry] of sessionUsers) {
    if (entry.expiresAt <= now) sessionUsers.delete(entryKey);
  }
  if (!sessionUsers.has(key) && sessionUsers.size >= MAX_CACHED_SESSIONS) {
    sessionUsers.delete(sessionUsers.keys().next().value);
  }
  const entry = { userId, user, expiresAt, pending: null };
  sessionUsers.set(key, entry);
  return entry;
}

async function getSessionUser(session, repository) {
  if (!session) return null;
  const cached = sessionUsers.get(session.cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    const user = await (cached.pending || cached.user);
    if (sessionUsers.get(session.cacheKey) !== cached) return getSessionUser(session, repository);
    return user ? { ...user } : null;
  }
  const version = sessionCacheVersion;
  const entry = storeSessionUser(session.cacheKey, session.userId, null,
    Math.min(Date.now() + SESSION_CACHE_TTL_MS, session.issuedAt + MAX_AGE_SECONDS * 1000));
  entry.pending = loadSessionUser(session.userId, repository);
  try {
    const user = await entry.pending;
    if (version !== sessionCacheVersion) {
      if (sessionUsers.get(session.cacheKey) === entry) sessionUsers.delete(session.cacheKey);
      return getSessionUser(session, repository);
    }
    require("./cache").invalidatePageCache(session.userId);
    entry.user = user;
    delete entry.pending;
    return user ? { ...user } : null;
  } catch (error) {
    if (sessionUsers.get(session.cacheKey) === entry) sessionUsers.delete(session.cacheKey);
    throw error;
  }
}

function invalidateSessionUsers(userId = null, roleId = null) {
  sessionCacheVersion += 1;
  const { invalidatePageCache } = require("./cache");
  for (const [key, entry] of sessionUsers) {
    if ((userId === null && roleId === null) ||
      (userId !== null && Number(entry.userId) === Number(userId)) ||
      (roleId !== null && (entry.pending || Number(entry.user?.role_id) === Number(roleId)))) {
      sessionUsers.delete(key);
      invalidatePageCache(entry.userId);
    }
  }
  if (userId !== null) invalidatePageCache(userId);
  if (roleId !== null) invalidatePageCache();
}

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.pbkdf2Sync(String(password), salt, 120000, 32, "sha256").toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  if (!stored || !stored.includes(":")) return false;
  const [salt, expected] = stored.split(":");
  const actual = hashPassword(password, salt).split(":")[1];
  if (actual.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(actual), Buffer.from(expected));
}

function sign(value) {
  return crypto.createHmac("sha256", SECRET).update(value).digest("hex");
}

function parseCookies(header = "") {
  return header.split(";").reduce((cookies, part) => {
    const [rawName, ...rawValue] = part.trim().split("=");
    if (!rawName) return cookies;
    try {
      cookies[rawName] = decodeURIComponent(rawValue.join("="));
    } catch {
      cookies[rawName] = "";
    }
    return cookies;
  }, Object.create(null));
}

function createSessionCookie(userId) {
  const payload = JSON.stringify({ userId, issuedAt: Date.now(), sessionId: crypto.randomBytes(16).toString("hex") });
  const encoded = Buffer.from(payload).toString("base64url");
  return `${encoded}.${sign(encoded)}`;
}

function readSession(req) {
  const cookies = parseCookies(req.headers.cookie || "");
  const token = cookies[COOKIE_NAME];
  if (!token || !token.includes(".")) return null;
  const parts = token.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  const [encoded, signature] = parts;
  const expectedSignature = sign(encoded);
  if (signature.length !== expectedSignature.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))) return null;
  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
    if (!payload.userId) return null;
    if (!Number.isFinite(payload.issuedAt) || payload.issuedAt > Date.now() || Date.now() - payload.issuedAt > MAX_AGE_SECONDS * 1000) return null;
    return { ...payload, cacheKey: crypto.createHash("sha256").update(token).digest("hex") };
  } catch {
    return null;
  }
}

function setSession(res, userId, user = null) {
  const token = createSessionCookie(userId);
  if (user) storeSessionUser(crypto.createHash("sha256").update(token).digest("hex"), userId, user, Date.now() + SESSION_CACHE_TTL_MS);
  const secure = process.env.COOKIE_SECURE === "true" || (process.env.NODE_ENV === "production" && process.env.LOCAL_HTTP !== "true") ? "; Secure" : "";
  res.setHeader(
    "Set-Cookie",
    `${COOKIE_NAME}=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${MAX_AGE_SECONDS}${secure}`
  );
}

function clearSession(res) {
  const secure = process.env.COOKIE_SECURE === "true" || (process.env.NODE_ENV === "production" && process.env.LOCAL_HTTP !== "true") ? "; Secure" : "";
  res.setHeader("Set-Cookie", `${COOKIE_NAME}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${secure}`);
}

module.exports = { clearSession, getSessionUser, hashPassword, invalidateSessionUsers, loadSessionUser, readSession, setSession, verifyPassword };