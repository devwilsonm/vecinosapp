const crypto = require("crypto");

const CSRF_COOKIE = "vecinosapp_csrf";
const CSRF_SECRET = process.env.CSRF_SECRET || process.env.SESSION_SECRET || "vecinosapp-local-csrf-secret-change-me";

function sign(value) {
  return crypto.createHmac("sha256", CSRF_SECRET).update(value).digest("hex");
}

function parseCookies(header = "") {
  return header.split(";").reduce((cookies, part) => {
    const [rawName, ...rawValue] = part.trim().split("=");
    if (!rawName) return cookies;
    cookies[rawName] = decodeURIComponent(rawValue.join("="));
    return cookies;
  }, {});
}

function createCsrfToken(secret) {
  return `${secret}.${sign(secret)}`;
}

function verifyCsrfToken(token, secret) {
  if (!token || !secret || !token.includes(".")) return false;
  const expected = createCsrfToken(secret);
  if (token.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(token), Buffer.from(expected));
}

function csrfCookie(secret) {
  const secure = process.env.COOKIE_SECURE === "true" ? "; Secure" : "";
  return `${CSRF_COOKIE}=${encodeURIComponent(secret)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=28800${secure}`;
}

function securityHeaders(req, res, next) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "same-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; form-action 'self'; frame-ancestors 'none'; base-uri 'self'"
  );
  next();
}

function csrfProtection(req, res, next) {
  if (req.path.startsWith("/css/") || req.path.startsWith("/js/") || req.path.startsWith("/favicon/")) return next();
  const cookies = parseCookies(req.headers.cookie || "");
  let csrfSecret = cookies[CSRF_COOKIE];
  if (!csrfSecret || csrfSecret.length < 32) {
    csrfSecret = crypto.randomBytes(32).toString("hex");
    res.setHeader("Set-Cookie", csrfCookie(csrfSecret));
  }
  res.locals.csrfToken = createCsrfToken(csrfSecret);
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
  if (req.body && verifyCsrfToken(req.body._csrf, csrfSecret)) return next();
  return res.status(403).render("error", {
    title: "Acción no permitida",
    message: "La solicitud no pudo validarse. Vuelve a cargar la página e inténtalo nuevamente."
  });
}

function safeRedirectPath(value, fallback = "/") {
  if (!value || typeof value !== "string") return fallback;
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\") || value.includes("://")) return fallback;
  return value;
}

module.exports = { csrfProtection, safeRedirectPath, securityHeaders };
