const fs = require("fs");
const path = require("path");
const initSqlJs = require("sql.js");
const { databasePath, dataDir } = require("../src/config");
const { db, initDb } = require("../src/db");
const { initLogDb } = require("../src/logDb");

const logDatabasePath = process.env.LOG_DATABASE_PATH || path.join(dataDir, "instance", "vecinosapp_logs.sqlite");
const tables = [
  "buildings",
  "occupants",
  "roles",
  "permissions",
  "receipts",
  "receipt_allocations",
  "payments",
  "public_allocation_links",
  "users",
  "role_permissions",
  "user_buildings"
];

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

async function copyTable(database, table) {
  const rows = sqliteRows(database, table);
  if (!rows.length) return 0;
  const columns = Object.keys(rows[0]);
  const placeholders = columns.map(() => "?").join(", ");
  const statement = `INSERT INTO ${table} (${columns.join(", ")}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`;
  for (const row of rows) await db.query(statement, columns.map((column) => row[column]));
  return rows.length;
}

async function resetSequence(table) {
  await db.query(`SELECT setval(pg_get_serial_sequence('${table}', 'id'), GREATEST(COALESCE(MAX(id), 1), 1), COUNT(*) > 0) FROM ${table}`);
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("Define DATABASE_URL con la cadena privada de Supabase antes de ejecutar la migración.");
  const SQL = await initSqlJs();
  const source = readSqliteDatabase(SQL, databasePath);
  const sourceLogs = readSqliteDatabase(SQL, logDatabasePath);
  if (!source) throw new Error(`No se encontró la base SQLite en ${databasePath}.`);

  await initDb();
  await initLogDb();
  for (const table of tables) {
    const count = await copyTable(source, table);
    if (["buildings", "occupants", "roles", "permissions", "receipts", "receipt_allocations", "payments", "public_allocation_links", "users"].includes(table)) await resetSequence(table);
    console.log(`${table}: ${count} filas procesadas.`);
  }
  const logCount = await copyTable(sourceLogs, "api_logs");
  await resetSequence("api_logs");
  console.log(`api_logs: ${logCount} filas procesadas.`);
  console.log("Migración SQLite → Supabase completada.");
}

main().catch((error) => {
  console.error("No se pudo completar la migración.", error);
  process.exit(1);
});
