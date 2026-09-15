const buckets = new Map();

function clientKey(req) {
  return req.ip || req.socket?.remoteAddress || "local";
}

function rateLimit({ max = 120, windowMs = 60_000, mutationsOnly = false, keyGenerator = clientKey } = {}) {
  return (req, res, next) => {
    if (mutationsOnly && ["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();

    const now = Date.now();
    const key = `${keyGenerator(req)}:${mutationsOnly ? "mutate" : "read"}`;
    const bucket = buckets.get(key) || { count: 0, resetAt: now + windowMs };

    if (bucket.resetAt <= now) {
      bucket.count = 0;
      bucket.resetAt = now + windowMs;
    }

    if (buckets.size > 1000) {
      for (const [bucketKey, value] of buckets) {
        if (value.resetAt <= now) buckets.delete(bucketKey);
      }
    }

    bucket.count += 1;
    buckets.set(key, bucket);

    res.setHeader("X-RateLimit-Limit", String(max));
    res.setHeader("X-RateLimit-Remaining", String(Math.max(0, max - bucket.count)));

    if (bucket.count > max) {
      res.setHeader("Retry-After", String(Math.ceil((bucket.resetAt - now) / 1000)));
      return res.status(429).render("error", {
        title: "Demasiadas solicitudes",
        message: "Se recibieron demasiadas solicitudes en poco tiempo. Intenta nuevamente en unos segundos."
      });
    }

    return next();
  };
}

module.exports = { rateLimit };