const cacheStore = new Map();

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
    if (!isCacheableRequest(req)) return next();

    const key = `${req.currentUser?.id || "anon"}:${req.originalUrl}`;
    const cached = cacheStore.get(key);
    if (cached && cached.expiresAt > Date.now()) {
      res.setHeader("X-VecinosApp-Cache", "HIT");
      res.setHeader("Cache-Control", "no-store");
      res.setHeader("Content-Type", cached.contentType);
      return res.status(cached.statusCode).send(cached.body);
    }

    const originalRender = res.render.bind(res);
    res.render = (view, options, callback) => {
      if (typeof callback === "function") return originalRender(view, options, callback);

      return originalRender(view, options, (error, html) => {
        if (error) return next(error);
        if (res.statusCode === 200) {
          cacheStore.set(key, {
            body: html,
            contentType: "text/html; charset=utf-8",
            statusCode: res.statusCode,
            expiresAt: Date.now() + ttlMs
          });
          res.setHeader("X-VecinosApp-Cache", "MISS");
          res.setHeader("Cache-Control", "no-store");
        }
        return res.send(html);
      });
    };

    return next();
  };
}

function invalidatePageCache() {
  cacheStore.clear();
}

function invalidateCacheOnMutation(req, res, next) {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
  res.on("finish", () => {
    if (res.statusCode < 500) invalidatePageCache();
  });
  return next();
}

module.exports = { invalidateCacheOnMutation, invalidatePageCache, pageCache };
