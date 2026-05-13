const { db, initDb } = require("../src/db");
const { clearApiLogs, initLogDb } = require("../src/logDb");

const tables = [
  "payments",
  "receipt_allocations",
  "receipts",
  "occupants",
  "user_buildings",
  "buildings"
];

async function main() {
  await initDb();
  await initLogDb();

  db.transaction(() => {
    tables.forEach((table) => db.prepare(`DELETE FROM ${table}`).run());
    try {
      tables.forEach((table) => db.prepare("DELETE FROM sqlite_sequence WHERE name = ?").run(table));
    } catch {
      // sqlite_sequence may not exist in very fresh databases.
    }
  })();

  clearApiLogs();
  console.log("Datos operativos y logs limpiados. Usuarios, perfiles y permisos se conservaron.");
}

main().catch((error) => {
  console.error("No se pudieron limpiar los datos.", error);
  process.exit(1);
});
