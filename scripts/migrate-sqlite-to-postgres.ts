const fs = require("fs");
const path = require("path");
const initSqlJs = require("sql.js");
const { databasePath, dataDir } = require("../src/config");
const { closeDb, db, initDb } = require("../src/infrastructure/database/database");
const { initLogDb } = require("../src/infrastructure/database/logDatabase");

const logDatabasePath = process.env.LOG_DATABASE_PATH || path.join(dataDir, "instance", "vecinosapp_logs.sqlite");
const tablesWithIds = ["buildings", "occupants", "roles", "permissions", "receipts", "receipt_allocations", "payments", "public_allocation_links", "users", "api_logs"];
const idMaps = new Map(tablesWithIds.map((table) => [table, new Map()]));

function readSqliteDatabase(SQL, filePath) {
  if (!fs.existsSync(filePath) || fs.statSync(filePath).size === 0) return null;
  return new SQL.Database(fs.readFileSync(filePath));
}

function sqliteRows(database, table) {
  if (!database) return [];
  const result = database.exec(`SELECT * FROM ${table}`);
  if (!result[0]) return [];
  return result[0].values.map((values) => Object.fromEntries(result[0].columns.map((column, index) => [column, values[index] ?? null])));
}

async function findExisting(table, row, uniqueColumns) {
  if (!uniqueColumns?.length) return null;
  const where = uniqueColumns.map((column) => `${column} IS NOT DISTINCT FROM ?`).join(" AND ");
  return db.prepare(`SELECT id FROM ${table} WHERE ${where} LIMIT 1`).get(...uniqueColumns.map((column) => row[column]));
}

async function insertMappedRow(table, row, uniqueColumns, overrides = {}) {
  const existing = await findExisting(table, { ...row, ...overrides }, uniqueColumns);
  if (existing) return existing.id;
  const values = { ...row, ...overrides };
  const columns = Object.keys(values).filter((column) => column !== "id");
  const result = await db.query(`INSERT INTO ${table} (${columns.join(", ")}) VALUES (${columns.map(() => "?").join(", ")}) ON CONFLICT DO NOTHING RETURNING id`, columns.map((column) => values[column]));
  if (result.rows[0]?.id) return result.rows[0].id;
  const afterConflict = await findExisting(table, values, uniqueColumns);
  if (!afterConflict) throw new Error(`No se pudo resolver ${table} para el registro ${JSON.stringify(uniqueColumns.map((column) => values[column]))}.`);
  return afterConflict.id;
}

function mapId(table, sourceId) {
  if (sourceId === null || sourceId === undefined) return null;
  return idMaps.get(table)?.get(Number(sourceId)) || null;
}

async function resetSequence(table) {
  await db.query(`SELECT setval(pg_get_serial_sequence('${table}', 'id'), GREATEST(COALESCE(MAX(id), 1), 1), COUNT(*) > 0) FROM ${table}`);
}

async function migrateRows(source) {
  const buildingRows = sqliteRows(source, "buildings");
  for (const row of buildingRows) {
    const id = await insertMappedRow("buildings", row, ["name", "address", "floors"]);
    idMaps.get("buildings").set(Number(row.id), id);
  }

  for (const row of sqliteRows(source, "occupants")) {
    const id = await insertMappedRow("occupants", row, ["document"], { building_id: mapId("buildings", row.building_id) });
    idMaps.get("occupants").set(Number(row.id), id);
  }

  for (const row of sqliteRows(source, "roles")) {
    const id = await insertMappedRow("roles", row, ["key"]);
    idMaps.get("roles").set(Number(row.id), id);
  }
  for (const row of sqliteRows(source, "permissions")) {
    const id = await insertMappedRow("permissions", row, ["key"]);
    idMaps.get("permissions").set(Number(row.id), id);
  }

  for (const row of sqliteRows(source, "receipts")) {
    const id = await insertMappedRow("receipts", row, ["receipt_number"], { building_id: mapId("buildings", row.building_id) });
    idMaps.get("receipts").set(Number(row.id), id);
  }

  for (const row of sqliteRows(source, "receipt_allocations")) {
    const receiptId = mapId("receipts", row.receipt_id);
    const occupantId = mapId("occupants", row.occupant_id);
    if (!receiptId || !occupantId) {
      console.warn(`Prorrateo ${row.id} omitido: referencia a recibo u ocupante inexistente.`);
      continue;
    }
    const values = {
      ...row,
      receipt_id: receiptId,
      occupant_id: occupantId
    };
    const id = await insertMappedRow("receipt_allocations", values, ["receipt_id", "occupant_id"]);
    idMaps.get("receipt_allocations").set(Number(row.id), id);
  }

  for (const row of sqliteRows(source, "payments")) {
    const allocationId = mapId("receipt_allocations", row.allocation_id);
    if (!allocationId) {
      console.warn(`Pago ${row.id} omitido: prorrateo inexistente.`);
      continue;
    }
    const values = { ...row, allocation_id: allocationId };
    const existing = await db.prepare("SELECT id FROM payments WHERE allocation_id = ? AND amount_cents = ? AND payment_date = ? AND payment_method = ? AND COALESCE(note, '') = COALESCE(?, '') LIMIT 1").get(values.allocation_id, values.amount_cents, values.payment_date, values.payment_method, values.note);
    const id = existing?.id || (await insertMappedRow("payments", values)).valueOf();
    idMaps.get("payments").set(Number(row.id), id);
  }

  for (const row of sqliteRows(source, "public_allocation_links")) {
    const receiptId = mapId("receipts", row.receipt_id);
    if (!receiptId) {
      console.warn(`Enlace público ${row.id} omitido: recibo inexistente.`);
      continue;
    }
    const id = await insertMappedRow("public_allocation_links", row, ["token"], { receipt_id: receiptId });
    idMaps.get("public_allocation_links").set(Number(row.id), id);
  }

  for (const row of sqliteRows(source, "users")) {
    const id = await insertMappedRow("users", row, ["email"], { role_id: mapId("roles", row.role_id) });
    idMaps.get("users").set(Number(row.id), id);
  }

  for (const row of sqliteRows(source, "role_permissions")) {
    const roleId = mapId("roles", row.role_id);
    const permissionId = mapId("permissions", row.permission_id);
    await db.prepare("INSERT INTO role_permissions (role_id, permission_id) VALUES (?, ?) ON CONFLICT DO NOTHING").run(roleId, permissionId);
  }
  for (const row of sqliteRows(source, "user_buildings")) {
    const userId = mapId("users", row.user_id);
    const buildingId = mapId("buildings", row.building_id);
    if (!userId || !buildingId) continue;
    await db.prepare("INSERT INTO user_buildings (user_id, building_id) VALUES (?, ?) ON CONFLICT DO NOTHING").run(userId, buildingId);
  }

  for (const table of tablesWithIds.filter((item) => item !== "api_logs")) await resetSequence(table);
}

async function migrateLogs(sourceLogs) {
  for (const row of sqliteRows(sourceLogs, "api_logs")) {
    const values = { ...row, user_id: mapId("users", row.user_id) };
    const columns = Object.keys(values);
    await db.query(`INSERT INTO api_logs (${columns.join(", ")}) VALUES (${columns.map(() => "?").join(", ")}) ON CONFLICT (id) DO NOTHING`, columns.map((column) => values[column]));
  }
  await resetSequence("api_logs");
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("Define DATABASE_URL con la cadena privada de Supabase antes de ejecutar la migración.");
  const SQL = await initSqlJs();
  const source = readSqliteDatabase(SQL, databasePath);
  const sourceLogs = readSqliteDatabase(SQL, logDatabasePath);
  if (!source) throw new Error(`No se encontró la base SQLite en ${databasePath}.`);
  await initDb();
  await initLogDb();
  await migrateRows(source);
  await migrateLogs(sourceLogs);
  console.log("Migración SQLite → Supabase completada y puede ejecutarse nuevamente sin duplicar datos.");
}

main().then(async () => {
  await closeDb();
}).catch(async (error) => {
  console.error("No se pudo completar la migración.", error);
  await closeDb();
  process.exit(1);
});
