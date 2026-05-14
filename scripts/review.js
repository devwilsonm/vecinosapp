const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const root = path.join(__dirname, "..");
const checks = [];
const warnings = [];

function run(command, args, options = {}) {
  const isWindowsNpm = process.platform === "win32" && command === "npm";
  const executable = isWindowsNpm ? process.env.ComSpec || "cmd.exe" : command;
  const finalArgs = isWindowsNpm ? ["/d", "/s", "/c", "npm", ...args] : args;
  const result = spawnSync(executable, finalArgs, {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, ...(options.env || {}) },
    shell: false
  });
  return {
    ok: result.status === 0,
    output: `${result.stdout || ""}${result.stderr || ""}${result.error ? result.error.message : ""}`.trim()
  };
}

function checkCleanInstall() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vecinosapp-install-"));
  const databasePath = path.join(tempDir, "vecinosapp.sqlite");
  const logDatabasePath = path.join(tempDir, "vecinosapp_logs.sqlite");
  const code = `
    Promise.all([require('./src/db').initDb(), require('./src/logDb').initLogDb()])
      .then(() => {
        const { db } = require('./src/db');
        const { listApiLogs } = require('./src/logDb');
        const required = {
          buildings: ['id','name','floors','created_by','updated_by'],
          occupants: ['id','building_id','full_name','document','floor','unit','created_by','updated_by'],
          receipts: ['id','building_id','service_type','receipt_number','total_amount_cents','consumption_total_milli','consumption_unit','created_by','updated_by'],
          receipt_allocations: ['id','receipt_id','occupant_id','assigned_amount_cents','consumption_milli','balance_cents','created_by','updated_by'],
          payments: ['id','allocation_id','amount_cents','payment_date','payment_method','created_by'],
          users: ['id','role_id','full_name','email','password_hash','created_by','updated_by'],
          roles: ['id','name','key','is_system','created_by','updated_by'],
          permissions: ['id','name','key','module'],
          role_permissions: ['role_id','permission_id'],
          user_buildings: ['user_id','building_id']
        };
        for (const [table, columns] of Object.entries(required)) {
          const existing = db.prepare('PRAGMA table_info(' + table + ')').all().map((column) => column.name);
          for (const column of columns) {
            if (!existing.includes(column)) throw new Error(table + '.' + column + ' no fue creado');
          }
        }
        const users = db.prepare('SELECT COUNT(*) AS total FROM users').get().total;
        const roles = db.prepare('SELECT COUNT(*) AS total FROM roles').get().total;
        const permissions = db.prepare('SELECT COUNT(*) AS total FROM permissions').get().total;
        const superAdmin = db.prepare("SELECT id FROM users WHERE email = 'admin@vecinosapp.local'").get();
        if (users < 1 || roles < 4 || permissions < 10 || !superAdmin) throw new Error('Datos base incompletos');
        if (!Array.isArray(listApiLogs({ limit: 10 }))) throw new Error('BD de logs no inicializa correctamente');
      })
      .catch((error) => { console.error(error.message); process.exit(1); });
  `;
  const result = run("node", ["-e", code], {
    env: { DATABASE_PATH: databasePath, LOG_DATABASE_PATH: logDatabasePath }
  });
  addCheck("Instalación limpia crea esquema completo", result.ok, result.output);
  fs.rmSync(tempDir, { recursive: true, force: true });
}

function walk(dir, predicate, files = []) {
  if (!fs.existsSync(dir)) return files;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath, predicate, files);
    } else if (predicate(fullPath)) {
      files.push(fullPath);
    }
  }
  return files;
}

function addCheck(name, ok, detail = "") {
  checks.push({ name, ok, detail });
}

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function checkSyntax() {
  const files = [
    ...walk(path.join(root, "src"), (file) => file.endsWith(".js")),
    ...walk(path.join(root, "scripts"), (file) => file.endsWith(".js")),
    ...walk(path.join(root, "public"), (file) => file.endsWith(".js"))
  ];

  for (const file of files) {
    const result = run("node", ["--check", file]);
    addCheck(`Sintaxis JS: ${path.relative(root, file)}`, result.ok, result.output);
  }
}

function checkSecurityGuards() {
  const server = read("src/server.js");
  const auth = read("src/utils/auth.js");
  const security = read("src/utils/security.js");
  const header = read("views/partials/header.ejs");
  const buildingAccess = read("src/utils/buildingAccess.js");

  addCheck("Middleware de headers de seguridad activo", server.includes("app.use(securityHeaders)"));
  addCheck("Protección CSRF activa", server.includes("app.use(csrfProtection)") && security.includes("csrfProtection"));
  addCheck("CSRF firmado por cliente", security.includes("vecinosapp_csrf") && security.includes("timingSafeEqual") && security.includes("HttpOnly"));
  addCheck("Rate limit activo", server.includes("rateLimit({ max: 240") && server.includes("mutationsOnly: true"));
  addCheck("Guard de login en rutas internas", server.includes("if (req.currentUser) return next();"));
  addCheck("Cookie de sesión HttpOnly", auth.includes("HttpOnly"));
  addCheck("Cookie de sesión SameSite=Lax", auth.includes("SameSite=Lax"));
  addCheck("Cookie Secure activable por variable", auth.includes("COOKIE_SECURE"));
  addCheck("Logout usa CSRF", header.includes('action="/logout"') && header.includes('name="_csrf"'));
  addCheck("Auditoría excluye rutas técnicas", server.includes("shouldAuditRequest") && server.includes("/favicon/") && server.includes("/.well-known/"));
  addCheck("Auditoría guarda acción y mensaje", read("src/logDb.js").includes("action TEXT") && read("src/logDb.js").includes("message TEXT"));
  addCheck("Permisos cargados en sesión", server.includes("req.currentUser.permissions") && server.includes("role_permissions"));
  addCheck("Edificios asignados cargados en sesión", server.includes("req.currentUser.building_ids") && server.includes("user_buildings"));
  addCheck("Helper de aislamiento por edificio disponible", buildingAccess.includes("function ensureBuildingAccess") && buildingAccess.includes("function buildingFilter"));
  addCheck("Navbar respeta permisos", header.includes('hasPermission("buildings.manage")') && header.includes('hasPermission("receipts.manage")'));
  [
    ["src/routes/dashboard.js", "dashboard.view"],
    ["src/routes/buildings.js", "buildings.manage"],
    ["src/routes/occupants.js", "occupants.manage"],
    ["src/routes/receipts.js", "receipts.manage"],
    ["src/routes/allocations.js", "allocations.manage"],
    ["src/routes/payments.js", "payments.manage"],
    ["src/routes/reports.js", "reports.view"]
  ].forEach(([file, permission]) => {
    const content = read(file);
    addCheck(`Ruta protegida por permiso: ${file}`, content.includes(`requirePermission("${permission}")`));
  });
  [
    "src/routes/dashboard.js",
    "src/routes/buildings.js",
    "src/routes/occupants.js",
    "src/routes/receipts.js",
    "src/routes/allocations.js",
    "src/routes/payments.js",
    "src/routes/reports.js"
  ].forEach((file) => {
    const content = read(file);
    addCheck(`Ruta aislada por edificio: ${file}`, content.includes("buildingAccess") || content.includes("ensureBuildingAccess") || content.includes("buildingFilter") || content.includes("activeBuildingsForUser"));
  });
}

function checkAuditColumns() {
  const db = read("src/db.js");
  const routeFiles = [
    "src/routes/buildings.js",
    "src/routes/occupants.js",
    "src/routes/receipts.js",
    "src/routes/allocations.js",
    "src/routes/payments.js"
  ];

  for (const table of ["buildings", "occupants", "receipts", "receipt_allocations", "payments"]) {
    addCheck(`Tabla auditada: ${table}`, db.includes(`ensureColumn("${table}"`));
  }

  for (const file of routeFiles) {
    const content = read(file);
    addCheck(`Ruta con usuario de auditoría: ${file}`, content.includes("req.currentUser.id"));
  }
}

function checkPerformance() {
  const server = read("src/server.js");
  const header = read("views/partials/header.ejs");
  const footer = read("views/partials/footer.ejs");
  const build = read("scripts/build.js");
  const cache = read("src/utils/cache.js");

  addCheck("Assets con cache en producción", server.includes("maxAge: isProduction") && server.includes("Cache-Control"));
  addCheck("Assets versionados por build", server.includes("assetVersion") && build.includes("assetVersion") && header.includes("?v=<%= assetVersion %>") && footer.includes("?v=<%= assetVersion %>"));
  addCheck("JavaScript con defer", footer.includes('src="/js/main.js?v=<%= assetVersion %>" defer'));
  addCheck("Build minifica CSS", build.includes("function minifyCss"));
  addCheck("Build minifica JS", build.includes("function minifyJs"));
  addCheck("Cache de páginas separado por usuario", cache.includes("req.currentUser?.id"));
}

function checkUnusedPartials() {
  const viewFiles = walk(path.join(root, "views"), (file) => file.endsWith(".ejs"));
  const allViews = viewFiles.map((file) => fs.readFileSync(file, "utf8")).join("\n");
  const partials = walk(path.join(root, "views", "partials"), (file) => file.endsWith(".ejs"));

  for (const partial of partials) {
    const relative = path.relative(path.join(root, "views"), partial).replace(/\\/g, "/").replace(/\.ejs$/, "");
    if (!allViews.includes(`partials/${path.basename(relative)}`) && !allViews.includes(relative)) {
      warnings.push(`Partial posiblemente no usado: ${path.relative(root, partial)}`);
    }
  }
}

function checkBuildAndAudit() {
  const audit = run("npm", ["audit", "--omit=dev"]);
  addCheck("npm audit sin vulnerabilidades productivas", audit.ok, audit.output);

  const build = run("node", ["scripts/build.js"]);
  addCheck("Build de producción exitoso", build.ok, build.output);
}

checkSyntax();
checkSecurityGuards();
checkAuditColumns();
checkPerformance();
checkCleanInstall();
checkUnusedPartials();
checkBuildAndAudit();

for (const check of checks) {
  console.log(`${check.ok ? "OK" : "ERROR"} ${check.name}`);
  if (!check.ok && check.detail) console.log(check.detail);
}

for (const warning of warnings) {
  console.log(`WARN ${warning}`);
}

const failed = checks.filter((check) => !check.ok);
if (failed.length) {
  console.error(`\nRevision fallida: ${failed.length} chequeo(s) requieren atención.`);
  process.exit(1);
}

console.log("\nRevision completada correctamente.");
