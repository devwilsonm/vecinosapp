const express = require("express");
const fs = require("fs");
const methodOverride = require("method-override");
const path = require("path");
const { port, rootDir } = require("./config");
const { db, initDb } = require("./db");
const { initLogDb, writeApiLog } = require("./logDb");
const { invalidateCacheOnMutation, pageCache } = require("./utils/cache");
const { formatMilliUnits } = require("./utils/consumption");
const { formatCents } = require("./utils/money");
const { rateLimit } = require("./utils/rateLimit");
const { csrfProtection, securityHeaders } = require("./utils/security");
const { statusClass } = require("./utils/view");
const { readSession } = require("./utils/auth");
const { hasPermission, isSuperAdmin } = require("./utils/access");

const authRoutes = require("./routes/auth");
const adminRoutes = require("./routes/admin");
const dashboardRoutes = require("./routes/dashboard");
const buildingRoutes = require("./routes/buildings");
const occupantRoutes = require("./routes/occupants");
const receiptRoutes = require("./routes/receipts");
const allocationRoutes = require("./routes/allocations");
const paymentRoutes = require("./routes/payments");
const reportRoutes = require("./routes/reports");

const app = express();
const isProduction = process.env.NODE_ENV === "production";
const buildInfoPath = path.join(rootDir, "build-info.json");
const assetVersion = fs.existsSync(buildInfoPath)
  ? JSON.parse(fs.readFileSync(buildInfoPath, "utf8")).assetVersion
  : process.env.ASSET_VERSION || new Date().toISOString().replace(/\D/g, "");
app.set("view engine", "ejs");
app.set("views", path.join(rootDir, "views"));
app.disable("x-powered-by");

app.use(securityHeaders);
app.use(express.urlencoded({ extended: false, limit: "50kb" }));
app.use(methodOverride("_method"));
app.use((req, res, next) => {
  const allowedFlashTypes = new Set(["success", "warning", "danger"]);
  res.locals.path = req.path;
  const flashType = allowedFlashTypes.has(req.query.type) ? req.query.type : "success";
  res.locals.flash = req.query.message ? { type: flashType, message: String(req.query.message).slice(0, 300) } : null;
  res.locals.money = formatCents;
  res.locals.consumption = formatMilliUnits;
  res.locals.statusClass = statusClass;
  res.locals.assetVersion = assetVersion;
  res.locals.currentUser = null;
  res.locals.isSuperAdmin = false;
  next();
});

app.use((req, res, next) => {
  const session = readSession(req);
  req.currentUser = session ? db.prepare(`
    SELECT u.id, u.role_id, u.full_name, u.email, r.name AS role_name, r.key AS role_key
    FROM users u
    LEFT JOIN roles r ON u.role_id = r.id
    WHERE u.id = ? AND u.is_active = 1
  `).get(session.userId) : null;
  if (req.currentUser) {
    req.currentUser.permissions = db.prepare(`
      SELECT p.key
      FROM permissions p
      JOIN role_permissions rp ON p.id = rp.permission_id
      WHERE rp.role_id = ?
    `).all(req.currentUser.role_id).map((permission) => permission.key);
    req.currentUser.building_ids = db.prepare(`
      SELECT building_id
      FROM user_buildings
      WHERE user_id = ?
    `).all(req.currentUser.id).map((row) => Number(row.building_id));
  }
  res.locals.currentUser = req.currentUser;
  res.locals.isSuperAdmin = isSuperAdmin(req.currentUser);
  res.locals.hasPermission = (permissionKey) => hasPermission(req.currentUser, permissionKey);
  next();
});

app.use((req, res, next) => {
  const startedAt = Date.now();
  const originalRender = res.render.bind(res);
  const originalRedirect = res.redirect.bind(res);
  res.render = (view, options, callback) => {
    if (options?.message && !req.auditMessage) req.auditMessage = String(options.message);
    if (Array.isArray(options?.errors) && options.errors.length && !req.auditMessage) {
      req.auditMessage = options.errors.join(" | ");
    }
    return originalRender(view, options, callback);
  };
  res.redirect = (statusOrUrl, maybeUrl) => {
    const target = typeof statusOrUrl === "string" ? statusOrUrl : maybeUrl;
    if (target && !req.auditMessage) {
      try {
        const url = new URL(target, "http://vecinosapp.local");
        const message = url.searchParams.get("message");
        if (message) req.auditMessage = message;
      } catch {
        // Keep redirect behavior unchanged if the URL cannot be parsed.
      }
    }
    if (typeof statusOrUrl === "number") return originalRedirect(statusOrUrl, maybeUrl);
    return originalRedirect(statusOrUrl);
  };
  res.on("finish", () => {
    if (!shouldAuditRequest(req, res.statusCode)) return;
    writeApiLog({
      userId: req.currentUser?.id,
      userEmail: req.currentUser?.email || req.auditUserEmail,
      method: req.method,
      path: req.originalUrl,
      statusCode: res.statusCode,
      durationMs: Date.now() - startedAt,
      action: auditAction(req),
      message: auditMessage(req, res.statusCode),
      ip: req.ip || req.socket?.remoteAddress,
      userAgent: req.headers["user-agent"] || ""
    });
  });
  next();
});

function isNoisePath(pathName) {
  return pathName.startsWith("/css/")
    || pathName.startsWith("/js/")
    || pathName.startsWith("/favicon/")
    || pathName === "/favicon.ico"
    || pathName.startsWith("/.well-known/");
}

function shouldAuditRequest(req, statusCode) {
  if (isNoisePath(req.path)) return false;
  if (["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) return true;
  return statusCode >= 400 && !["GET", "HEAD", "OPTIONS"].includes(req.method);
}

function auditAction(req) {
  if (req.path === "/login" && req.method === "POST") return "login";
  if (req.path === "/logout" && req.method === "POST") return "logout";
  if (req.path.startsWith("/buildings")) return "edificio";
  if (req.path.startsWith("/occupants")) return "ocupante";
  if (req.path.startsWith("/receipts")) return "recibo";
  if (req.path.startsWith("/allocations")) return "prorrateo";
  if (req.path.startsWith("/payments")) return "pago";
  if (req.path.startsWith("/admin/users")) return "usuario";
  if (req.path.startsWith("/admin/roles")) return "perfil";
  return "transaccion";
}

function auditMessage(req, statusCode) {
  const message = req.auditErrorMessage || req.auditMessage;
  if (message) return String(message).slice(0, 500);
  if (statusCode >= 400) return `Solicitud finalizada con estado HTTP ${statusCode}.`;
  return null;
}

app.use(csrfProtection);
app.use(express.static(path.join(rootDir, "public"), {
  etag: true,
  maxAge: isProduction ? "1d" : 0,
  setHeaders(res) {
    if (isProduction) {
      res.setHeader("Cache-Control", "public, max-age=86400");
    }
  }
}));
app.use(rateLimit({ max: 240, windowMs: 60_000 }));
app.use(rateLimit({ max: 60, windowMs: 60_000, mutationsOnly: true }));

app.use(authRoutes);

app.use((req, res, next) => {
  if (req.currentUser) return next();
  return res.redirect("/login");
});

app.use(invalidateCacheOnMutation);
app.use(pageCache());

app.use("/", dashboardRoutes);
app.use("/buildings", buildingRoutes);
app.use("/occupants", occupantRoutes);
app.use("/receipts", receiptRoutes);
app.use("/allocations", allocationRoutes);
app.use("/payments", paymentRoutes);
app.use("/reports", reportRoutes);
app.use("/admin", adminRoutes);

app.use((req, res) => {
  res.status(404).render("error", { title: "Página no encontrada", message: "La página solicitada no existe." });
});

app.use((error, req, res, next) => {
  console.error(error);
  req.auditErrorMessage = error?.message || "Error inesperado.";
  res.status(500).render("error", { title: "Error", message: "Ocurrió un error inesperado." });
});

Promise.all([initDb(), initLogDb()])
  .then(() => {
    app.listen(port, () => {
      console.log(`VecinosApp disponible en http://localhost:${port}`);
    });
  })
  .catch((error) => {
    console.error("No se pudo inicializar la base de datos.", error);
    process.exit(1);
  });
