const { db, initDb, usePostgres } = require("../src/infrastructure/database/database");
const { clearApiLogs, initLogDb } = require("../src/infrastructure/database/logDatabase");

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

  const clear = db.transaction(async () => {
    for (const table of tables) await db.prepare(`DELETE FROM ${table}`).run();
    if (!usePostgres) {
      try {
        for (const table of tables) await db.prepare("DELETE FROM sqlite_sequence WHERE name = ?").run(table);
      } catch {
        // sqlite_sequence may not exist in very fresh databases.
      }
    }
  });
  await clear();

  await clearApiLogs();
  console.log("Datos operativos y logs limpiados. Usuarios, perfiles y permisos se conservaron.");
}

main().catch((error) => {
  console.error("No se pudieron limpiar los datos.", error);
  process.exit(1);
});
