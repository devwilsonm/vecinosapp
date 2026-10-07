const cacheStore = new Map();
const MAX_CACHE_ENTRIES = 200;
const MAX_CACHE_BYTES = 16 * 1024 * 1024;
let cacheBytes = 0;
let cacheVersion = 0;
let lastCleanup = 0;

function deleteCachedPage(key) {
  const entry = cacheStore.get(key);
  if (!entry) return;
  cacheBytes -= entry.bytes;
  cacheStore.delete(key);
}

function cleanupCache(now) {
  for (const [key, entry] of cacheStore) {
    if (entry.expiresAt <= now) deleteCachedPage(key);
  }
  lastCleanup = now;
}

const DEFAULT_TTL_MS = 15_000;
const CACHEABLE_PREFIXES = [
  "/",
  "/buildings",
  "/occupants",
  "/receipts",
  "/allocations",
  "/payments",
  "/reports",
  "/admin"
];

function isCacheableRequest(req) {
  if (req.method !== "GET") return false;
  if (req.query.message || req.query.type) return false;
  if (req.path.includes("/new") || req.path.includes("/edit")) return false;
  if (req.path.startsWith("/admin/logs")) return false;
  if (req.path.startsWith("/css/") || req.path.startsWith("/js/")) return false;
  return CACHEABLE_PREFIXES.some((prefix) => req.path === prefix || req.path.startsWith(`${prefix}/`));
}

function pageCache(ttlMs = DEFAULT_TTL_MS) {
  return (req, res, next) => {
    if (!isCacheableRequest(req) || !req.session?.cacheKey) return next();
    const now = Date.now();
    if (now - lastCleanup >= DEFAULT_TTL_MS) cleanupCache(now);
    const version = cacheVersion;

    const key = `${req.session.cacheKey}:${res.locals.csrfToken}:${res.locals.publicTheme}:${req.originalUrl}`;
    const cached = cacheStore.get(key);
    if (cached && cached.expiresAt > Date.now()) {
      res.setHeader("X-VecinosApp-Cache", "HIT");
      res.setHeader("Cache-Control", "no-store");
      res.setHeader("Content-Type", cached.contentType);
      return res.status(cached.statusCode).send(cached.body);
    }

    if (cached) deleteCachedPage(key);
    const originalRender = res.render.bind(res);
    res.render = (view, options, callback) => {
      if (typeof callback === "function") return originalRender(view, options, callback);

      return originalRender(view, options, (error, html) => {
        if (error) return next(error);
        if (res.statusCode === 200 && version === cacheVersion) {
          const bytes = Buffer.byteLength(html, "utf8");
          if (bytes <= MAX_CACHE_BYTES) {
            deleteCachedPage(key);
            cleanupCache(Date.now());
            while (cacheStore.size >= MAX_CACHE_ENTRIES || cacheBytes + bytes > MAX_CACHE_BYTES) {
              deleteCachedPage(cacheStore.keys().next().value);
            }
            cacheBytes += bytes;
            cacheStore.set(key, {
              userId: req.currentUser.id,
              path: req.path,
              bytes,
              body: html,
              contentType: "text/html; charset=utf-8",
              statusCode: res.statusCode,
              expiresAt: Date.now() + ttlMs
            });
          }
          res.setHeader("X-VecinosApp-Cache", "MISS");
          res.setHeader("Cache-Control", "no-store");
        }
        return res.send(html);
      });
    };

    return next();
  };
}

function invalidatePageCache(userId = null, prefix = null) {
  cacheVersion += 1;
  for (const [key, entry] of cacheStore) {
    if ((userId === null || Number(entry.userId) === Number(userId)) &&
      (prefix === null || entry.path === prefix || entry.path.startsWith(prefix + "/"))) {
      deleteCachedPage(key);
    }
  }
}

function invalidateCacheOnMutation(req, res, next) {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
  res.on("finish", () => {
    if (res.statusCode >= 400) return;
    // Administrative changes do not alter receipt, payment or report data.
    const adminOnly = /^\/admin\/(users|roles)(\/|$)/.test(req.path);
    invalidatePageCache(null, adminOnly ? "/admin" : null);
  });
  return next();
}

module.exports = { invalidateCacheOnMutation, invalidatePageCache, pageCache };