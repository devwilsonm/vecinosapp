const fs = require("fs");
const path = require("path");
const initSqlJs = require("sql.js");
const { databasePath } = require("./config");
const { hashPassword } = require("./utils/auth");

let database = null;
let inTransaction = false;

function normalizeParams(params) {
  if (params.length === 1 && Array.isArray(params[0])) return params[0];
  return params;
}

function saveDb() {
  if (!database) return;
  fs.mkdirSync(path.dirname(databasePath), { recursive: true });
  const tempPath = `${databasePath}.tmp`;
  fs.writeFileSync(tempPath, Buffer.from(database.export()));
  fs.renameSync(tempPath, databasePath);
}

const db = {
  exec(sql) {
    database.exec(sql);
    saveDb();
  },
  prepare(sql) {
    return {
      get(...params) {
        const stmt = database.prepare(sql);
        try {
          const values = normalizeParams(params);
          if (values.length) stmt.bind(values);
          if (!stmt.step()) return undefined;
          return stmt.getAsObject();
        } finally {
          stmt.free();
        }
      },
      all(...params) {
        const stmt = database.prepare(sql);
        const rows = [];
        try {
          const values = normalizeParams(params);
          if (values.length) stmt.bind(values);
          while (stmt.step()) rows.push(stmt.getAsObject());
          return rows;
        } finally {
          stmt.free();
        }
      },
      run(...params) {
        const values = normalizeParams(params);
        database.run(sql, values);
        const last = database.exec("SELECT last_insert_rowid() AS id");
        if (!inTransaction) saveDb();
        return { lastInsertRowid: last[0]?.values[0]?.[0] || 0 };
      }
    };
  },
  transaction(fn) {
    return (...args) => {
      database.run("BEGIN");
      inTransaction = true;
      try {
        const result = fn(...args);
        inTransaction = false;
        database.run("COMMIT");
        saveDb();
        return result;
      } catch (error) {
        inTransaction = false;
        try {
          database.run("ROLLBACK");
        } catch {
          // Keep the original error; SQLite may already have ended the transaction.
        }
        throw error;
      }
    };
  }
};

async function openDb() {
  if (database) return;
  const SQL = await initSqlJs();
  fs.mkdirSync(path.dirname(databasePath), { recursive: true });
  if (fs.existsSync(databasePath) && fs.statSync(databasePath).size > 0) {
    database = new SQL.Database(fs.readFileSync(databasePath));
  } else {
    database = new SQL.Database();
    saveDb();
  }
}

async function initDb() {
  await openDb();
  db.exec(`
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS occupants (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      building_id INTEGER,
      full_name TEXT NOT NULL,
      document TEXT NOT NULL UNIQUE,
      phone TEXT,
      email TEXT,
      floor TEXT NOT NULL,
      unit TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      created_by INTEGER,
      updated_by INTEGER
    );

    CREATE TABLE IF NOT EXISTS buildings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      address TEXT,
      floors INTEGER NOT NULL DEFAULT 1,
      notes TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      created_by INTEGER,
      updated_by INTEGER
    );

    CREATE TABLE IF NOT EXISTS receipts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      building_id INTEGER,
      service_type TEXT NOT NULL,
      receipt_number TEXT NOT NULL UNIQUE,
      period TEXT NOT NULL,
      issue_date TEXT NOT NULL,
      due_date TEXT NOT NULL,
      total_amount_cents INTEGER NOT NULL,
      consumption_total_milli INTEGER NOT NULL DEFAULT 0,
      consumption_unit TEXT,
      description TEXT,
      status TEXT NOT NULL DEFAULT 'pendiente',
      file_reference TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      created_by INTEGER,
      updated_by INTEGER,
      FOREIGN KEY(building_id) REFERENCES buildings(id)
    );

    CREATE TABLE IF NOT EXISTS receipt_allocations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      receipt_id INTEGER NOT NULL,
      occupant_id INTEGER NOT NULL,
      assigned_amount_cents INTEGER NOT NULL,
      consumption_milli INTEGER NOT NULL DEFAULT 0,
      paid_amount_cents INTEGER NOT NULL DEFAULT 0,
      balance_cents INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'pendiente',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      created_by INTEGER,
      updated_by INTEGER,
      UNIQUE(receipt_id, occupant_id),
      FOREIGN KEY(receipt_id) REFERENCES receipts(id) ON DELETE CASCADE,
      FOREIGN KEY(occupant_id) REFERENCES occupants(id)
    );

    CREATE TABLE IF NOT EXISTS payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      allocation_id INTEGER NOT NULL,
      amount_cents INTEGER NOT NULL,
      payment_date TEXT NOT NULL,
      payment_method TEXT NOT NULL,
      note TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      created_by INTEGER,
      FOREIGN KEY(allocation_id) REFERENCES receipt_allocations(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      role_id INTEGER,
      full_name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      created_by INTEGER,
      updated_by INTEGER,
      FOREIGN KEY(role_id) REFERENCES roles(id)
    );

    CREATE TABLE IF NOT EXISTS roles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      key TEXT NOT NULL UNIQUE,
      description TEXT,
      is_system INTEGER NOT NULL DEFAULT 0,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      created_by INTEGER,
      updated_by INTEGER
    );

    CREATE TABLE IF NOT EXISTS permissions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      key TEXT NOT NULL UNIQUE,
      module TEXT NOT NULL,
      description TEXT
    );

    CREATE TABLE IF NOT EXISTS role_permissions (
      role_id INTEGER NOT NULL,
      permission_id INTEGER NOT NULL,
      PRIMARY KEY(role_id, permission_id),
      FOREIGN KEY(role_id) REFERENCES roles(id) ON DELETE CASCADE,
      FOREIGN KEY(permission_id) REFERENCES permissions(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS user_buildings (
      user_id INTEGER NOT NULL,
      building_id INTEGER NOT NULL,
      PRIMARY KEY(user_id, building_id),
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY(building_id) REFERENCES buildings(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_occupants_building ON occupants(building_id, floor, unit);
    CREATE INDEX IF NOT EXISTS idx_receipts_building_status ON receipts(building_id, status, due_date);
    CREATE INDEX IF NOT EXISTS idx_allocations_receipt ON receipt_allocations(receipt_id);
    CREATE INDEX IF NOT EXISTS idx_allocations_occupant ON receipt_allocations(occupant_id);
    CREATE INDEX IF NOT EXISTS idx_payments_allocation ON payments(allocation_id);
    CREATE INDEX IF NOT EXISTS idx_user_buildings_building ON user_buildings(building_id);
  `);

  function ensureColumn(table, column, definition) {
    const columns = db.prepare(`PRAGMA table_info(${table})`).all().map((item) => item.name);
    if (!columns.includes(column)) {
      database.run(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
      saveDb();
    }
  }

  ensureColumn("occupants", "building_id", "INTEGER");
  ensureColumn("occupants", "created_by", "INTEGER");
  ensureColumn("occupants", "updated_by", "INTEGER");
  ensureColumn("buildings", "created_by", "INTEGER");
  ensureColumn("buildings", "updated_by", "INTEGER");
  ensureColumn("receipts", "building_id", "INTEGER");
  ensureColumn("receipts", "created_by", "INTEGER");
  ensureColumn("receipts", "updated_by", "INTEGER");
  ensureColumn("receipts", "consumption_total_milli", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn("receipts", "consumption_unit", "TEXT");
  ensureColumn("receipt_allocations", "created_by", "INTEGER");
  ensureColumn("receipt_allocations", "updated_by", "INTEGER");
  ensureColumn("receipt_allocations", "consumption_milli", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn("payments", "created_by", "INTEGER");
  ensureColumn("users", "role_id", "INTEGER");
  ensureColumn("users", "created_by", "INTEGER");
  ensureColumn("users", "updated_by", "INTEGER");
  ensureColumn("roles", "created_by", "INTEGER");
  ensureColumn("roles", "updated_by", "INTEGER");

  db.exec("CREATE INDEX IF NOT EXISTS idx_users_role ON users(role_id);");

  const defaultRoles = [
    ["Super Admin", "super_admin", "Acceso total a la aplicación.", 1],
    ["Administrador", "admin", "Administra la operación general sin mantenimiento crítico.", 1],
    ["Propietario", "owner", "Gestiona edificios asignados, ocupantes, pisos, recibos y pagos.", 1],
    ["Operador", "operator", "Registra información operativa con permisos limitados.", 1]
  ];
  defaultRoles.forEach((role) => {
    const exists = db.prepare("SELECT id FROM roles WHERE key = ?").get(role[1]);
    if (!exists) {
      db.prepare("INSERT INTO roles (name, key, description, is_system, is_active) VALUES (?, ?, ?, ?, 1)").run(...role);
    }
  });

  const defaultPermissions = [
    ["Ver dashboard", "dashboard.view", "Dashboard", "Acceder al resumen principal."],
    ["Gestionar edificios", "buildings.manage", "Gestión", "Crear, editar o desactivar edificios."],
    ["Gestionar ocupantes", "occupants.manage", "Gestión", "Crear, editar o desactivar ocupantes."],
    ["Gestionar recibos", "receipts.manage", "Servicios", "Crear, editar o eliminar recibos."],
    ["Generar prorrateos", "allocations.manage", "Servicios", "Crear o recalcular prorrateos."],
    ["Registrar pagos", "payments.manage", "Servicios", "Registrar pagos parciales o totales."],
    ["Ver reportes", "reports.view", "Reportes", "Acceder a reportes de deuda y recaudación."],
    ["Administrar usuarios", "users.manage", "Administración", "Crear y editar usuarios."],
    ["Administrar perfiles", "roles.manage", "Administración", "Gestionar perfiles y permisos."],
    ["Administrar mantenimiento", "maintenance.manage", "Administración", "Acceder a opciones de mantenimiento."]
  ];
  defaultPermissions.forEach((permission) => {
    const exists = db.prepare("SELECT id FROM permissions WHERE key = ?").get(permission[1]);
    if (!exists) {
      db.prepare("INSERT INTO permissions (name, key, module, description) VALUES (?, ?, ?, ?)").run(...permission);
    }
  });

  const allPermissions = db.prepare("SELECT id FROM permissions").all();
  const permissionByKeyStmt = db.prepare("SELECT id FROM permissions WHERE key = ?");
  const roleByKeyStmt = db.prepare("SELECT id FROM roles WHERE key = ?");
  const permissionByKey = (key) => permissionByKeyStmt.get(key);
  const roleByKey = (key) => roleByKeyStmt.get(key);
  const rolePermissionSets = {
    super_admin: allPermissions.map((permission) => permission.id),
    admin: ["dashboard.view", "buildings.manage", "occupants.manage", "receipts.manage", "allocations.manage", "payments.manage", "reports.view"].map((key) => permissionByKey(key)?.id).filter(Boolean),
    owner: ["dashboard.view", "buildings.manage", "occupants.manage", "receipts.manage", "allocations.manage", "payments.manage", "reports.view"].map((key) => permissionByKey(key)?.id).filter(Boolean),
    operator: ["dashboard.view", "occupants.manage", "payments.manage", "reports.view"].map((key) => permissionByKey(key)?.id).filter(Boolean)
  };
  Object.entries(rolePermissionSets).forEach(([roleKey, permissionIds]) => {
    const role = roleByKey(roleKey);
    if (!role) return;
    permissionIds.forEach((permissionId) => {
      const exists = db.prepare("SELECT 1 FROM role_permissions WHERE role_id = ? AND permission_id = ?").get(role.id, permissionId);
      if (!exists) db.prepare("INSERT INTO role_permissions (role_id, permission_id) VALUES (?, ?)").run(role.id, permissionId);
    });
  });

  const userCount = db.prepare("SELECT COUNT(*) AS total FROM users").get().total;
  const superAdminRole = db.prepare("SELECT id FROM roles WHERE key = 'super_admin'").get();
  if (userCount === 0) {
    db.prepare(`
      INSERT INTO users (role_id, full_name, email, password_hash, is_active)
      VALUES (?, ?, ?, ?, 1)
    `).run(superAdminRole?.id || null, "Administrador", "admin@vecinosapp.local", hashPassword("admin123"));
  } else if (superAdminRole) {
    db.prepare("UPDATE users SET role_id = ? WHERE email = ? AND role_id IS NULL").run(superAdminRole.id, "admin@vecinosapp.local");
  }

  const buildingCount = db.prepare("SELECT COUNT(*) AS total FROM buildings").get().total;
  const occupantsWithoutBuilding = db.prepare("SELECT COUNT(*) AS total FROM occupants WHERE building_id IS NULL").get().total;
  if (buildingCount === 0 && occupantsWithoutBuilding > 0) {
    const buildingId = db.prepare(`
      INSERT INTO buildings (name, address, floors, notes, is_active)
      VALUES (?, ?, ?, ?, 1)
    `).run("Edificio principal", "", 3, "Edificio creado automáticamente para ocupantes existentes.").lastInsertRowid;
    db.prepare("UPDATE occupants SET building_id = ? WHERE building_id IS NULL").run(buildingId);
  }

  const fallbackBuilding = db.prepare("SELECT id FROM buildings ORDER BY id LIMIT 1").get();
  if (fallbackBuilding) {
    db.prepare("UPDATE receipts SET building_id = ? WHERE building_id IS NULL").run(fallbackBuilding.id);
  }
}

module.exports = { db, initDb };
