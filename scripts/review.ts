const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const root = path.join(__dirname, "..");
const tsxCli = require.resolve("tsx/cli");
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
    (async () => {
      await Promise.all([require('./src/infrastructure/database/database').initDb(), require('./src/infrastructure/database/logDatabase').initLogDb()]);
        const { db } = require('./src/infrastructure/database/database');
        const { listApiLogs } = require('./src/infrastructure/database/logDatabase');
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
          for (const column of columns) {
            await db.query('SELECT ' + column + ' FROM ' + table + ' LIMIT 0');
          }
        }
        const users = Number((await db.prepare('SELECT COUNT(*) AS total FROM users').get()).total);
        const roles = Number((await db.prepare('SELECT COUNT(*) AS total FROM roles').get()).total);
        const permissions = Number((await db.prepare('SELECT COUNT(*) AS total FROM permissions').get()).total);
        const superAdmin = await db.prepare("SELECT id FROM users WHERE email = 'admin@vecinosapp.local'").get();
        if (users < 1 || roles < 4 || permissions < 10 || !superAdmin) throw new Error('Datos base incompletos');
        if (!Array.isArray(await listApiLogs({ limit: 10 }))) throw new Error('BD de logs no inicializa correctamente');
    })().catch((error) => { console.error(error.message); process.exit(1); });
  `;
  const result = run(process.execPath, [tsxCli, "-e", code], {
    env: { DATABASE_URL: "", DATABASE_PATH: databasePath, LOG_DATABASE_PATH: logDatabasePath }
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
  const aliases = {
    "src/db.ts": "src/infrastructure/database/database.ts",
    "src/db.js": "src/infrastructure/database/database.ts",
    "src/logDb.ts": "src/infrastructure/database/logDatabase.ts",
    "src/logDb.js": "src/infrastructure/database/logDatabase.ts"
  };
  const normalizedPath = aliases[relativePath] || ((relativePath.startsWith("src/") || relativePath.startsWith("scripts/"))
    ? relativePath.replace(/\.js$/, ".ts")
    : relativePath);
  return fs.readFileSync(path.join(root, normalizedPath), "utf8");
}

function checkSyntax() {
  const typecheck = run(process.execPath, [path.join(root, "node_modules", "typescript", "bin", "tsc"), "--noEmit", "-p", path.join(root, "tsconfig.json")]);
  addCheck("Sintaxis TypeScript", typecheck.ok, typecheck.output);
  const browserTypecheck = run(process.execPath, [path.join(root, "node_modules", "typescript", "bin", "tsc"), "--noEmit", "-p", path.join(root, "tsconfig.browser.json")]);
  addCheck("Sintaxis TypeScript del navegador", browserTypecheck.ok, browserTypecheck.output);
}

function checkSecurityGuards() {
  const server = read("src/server.ts");
  const auth = read("src/utils/auth.ts");
  const security = read("src/utils/security.ts");
  const header = read("views/partials/header.ejs");
  const buildingAccess = read("src/utils/buildingAccess.ts");

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
  addCheck("Permisos cargados en sesión", server.includes("req.currentUser.permissions") && server.includes("listPermissionKeys"));
  addCheck("Edificios asignados cargados en sesión", server.includes("req.currentUser.building_ids") && server.includes("listBuildingIds"));
  addCheck("Helper de aislamiento por edificio disponible", buildingAccess.includes("function ensureBuildingAccess") && buildingAccess.includes("function buildingFilter"));
  addCheck("Navbar respeta permisos", header.includes('hasPermission("buildings.manage")') && header.includes('hasPermission("receipts.manage")'));
  [
    ["src/routes/dashboard.ts", "dashboard.view"],
    ["src/routes/buildings.ts", "buildings.manage"],
    ["src/routes/occupants.ts", "occupants.manage"],
    ["src/routes/receipts.ts", "receipts.manage"],
    ["src/routes/allocations.ts", "allocations.manage"],
    ["src/routes/payments.ts", "payments.manage"],
    ["src/routes/reports.ts", "reports.view"]
  ].forEach(([file, permission]) => {
    const content = read(file);
    addCheck(`Ruta protegida por permiso: ${file}`, content.includes(`requirePermission("${permission}")`));
  });
  [
    "src/routes/dashboard.ts",
    "src/routes/buildings.ts",
    "src/routes/occupants.ts",
    "src/routes/receipts.ts",
    "src/routes/allocations.ts",
    "src/routes/payments.ts",
    "src/routes/reports.ts"
  ].forEach((file) => {
    const content = read(file);
    addCheck(`Ruta aislada por edificio: ${file}`, content.includes("buildingAccess") || content.includes("ensureBuildingAccess") || content.includes("buildingFilter") || content.includes("activeBuildingsForUser"));
  });
}

function checkNpmSupplyChainRisk() {
  const packageJson = JSON.parse(read("package.json"));
  const scripts = packageJson.scripts || {};
  const installLifecycleScripts = ["preinstall", "install", "postinstall", "prepare"];
  const declaredInstallScripts = installLifecycleScripts.filter((script) => Object.prototype.hasOwnProperty.call(scripts, script));
  addCheck(
    "package.json sin scripts de instalación automática",
    declaredInstallScripts.length === 0,
    declaredInstallScripts.length ? `Scripts detectados: ${declaredInstallScripts.join(", ")}` : ""
  );

  const lock = read("package-lock.json");
  const lockData = JSON.parse(lock);
  const packagesWithInstallScripts = Object.entries(lockData.packages || {})
    .filter(([, packageInfo]) => packageInfo.hasInstallScript)
    .map(([packagePath]) => packagePath);
  const expectedInstallScripts = new Set(["node_modules/esbuild", "node_modules/fsevents"]);
  const unexpectedInstallScripts = packagesWithInstallScripts.filter((packagePath) => !expectedInstallScripts.has(packagePath));
  addCheck(
    "package-lock con scripts de instalación conocidos",
    unexpectedInstallScripts.length === 0,
    unexpectedInstallScripts.length ? `Paquetes detectados: ${unexpectedInstallScripts.join(", ")}` : ""
  );

  const suspiciousPackages = [
    '"node_modules/axios"',
    '"node_modules/plain-crypto-js"',
    '"node_modules/openclaw"',
    '"node_modules/cline"',
    '"node_modules/napi-postinstall"',
    '"node_modules/eslint-config-prettier"',
    '"node_modules/synckit"',
    '"node_modules/@pkgr/core"'
  ];
  const matches = suspiciousPackages.filter((name) => lock.includes(name));
  addCheck(
    "package-lock sin paquetes IoC npm recientes",
    matches.length === 0,
    matches.length ? `Paquetes detectados: ${matches.join(", ")}` : ""
  );
}

function checkAuditColumns() {
  const db = read("src/infrastructure/database/database.ts");
  const routeFiles = [
    "src/routes/buildings.ts",
    "src/routes/occupants.ts",
    "src/routes/receipts.ts",
    "src/routes/allocations.ts",
    "src/routes/payments.ts"
  ];

  for (const table of ["buildings", "occupants", "receipts", "receipt_allocations", "payments"]) {
    addCheck(`Tabla auditada: ${table}`, db.includes(`CREATE TABLE IF NOT EXISTS ${table}`));
  }

  for (const file of routeFiles) {
    const content = read(file);
    addCheck(`Ruta con usuario de auditoría: ${file}`, content.includes("req.currentUser.id"));
  }
}

function checkPerformance() {
  const server = read("src/server.ts");
  const header = read("views/partials/header.ejs");
  const footer = read("views/partials/footer.ejs");
  const build = read("scripts/build.ts");
  const cache = read("src/utils/cache.ts");

  addCheck("Assets con cache en producción", server.includes("maxAge: isProduction") && server.includes("Cache-Control"));
  addCheck("Assets versionados por build", server.includes("assetVersion") && build.includes("assetVersion") && header.includes("?v=<%= assetVersion %>") && footer.includes("?v=<%= assetVersion %>"));
  addCheck("JavaScript compilado con defer", footer.includes('src="/js/main.js?v=<%= assetVersion %>" defer'));
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
  if (!audit.ok && /(audit endpoint|request to https?:\/\/registry\.npmjs\.org|network)/i.test(audit.output)) {
    warnings.push("npm audit no pudo consultar el registro por un problema de red; ejecútalo de nuevo con conexión disponible.");
  } else {
    addCheck("npm audit sin vulnerabilidades productivas", audit.ok, audit.output);
  }

  const build = run(process.execPath, [tsxCli, "scripts/build.ts"]);
  addCheck("Build de producción exitoso", build.ok, build.output);
}

checkSyntax();
checkNpmSupplyChainRisk();
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