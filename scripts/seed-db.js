const { db, initDb } = require("../src/db");
const { splitAmount } = require("../src/utils/money");
const { updateAllocationStatus, updateReceiptStatus } = require("../src/utils/status");

const seed = db.transaction(() => {
  db.prepare("DELETE FROM payments").run();
  db.prepare("DELETE FROM receipt_allocations").run();
  db.prepare("DELETE FROM receipts").run();
  db.prepare("DELETE FROM occupants").run();
  db.prepare("DELETE FROM buildings").run();

  const buildingId = db.prepare(`
    INSERT INTO buildings (name, address, floors, notes, is_active)
    VALUES (?, ?, ?, ?, 1)
  `).run("Edificio Los Vecinos", "Av. Principal 123", 3, "Edificio de prueba con tres pisos.").lastInsertRowid;

  const insertOccupant = db.prepare(`
    INSERT INTO occupants (building_id, full_name, document, phone, email, floor, unit, is_active)
    VALUES (?, ?, ?, ?, ?, ?, ?, 1)
  `);
  const occupants = [
    [buildingId, "Ana Torres", "DNI001", "999111001", "ana@example.com", "1", "101"],
    [buildingId, "Luis Rojas", "DNI002", "999111002", "luis@example.com", "1", "102"],
    [buildingId, "Carmen Vega", "DNI003", "999111003", "carmen@example.com", "2", "201"],
    [buildingId, "Marco Diaz", "DNI004", "999111004", "marco@example.com", "2", "202"],
    [buildingId, "Elena Ruiz", "DNI005", "999111005", "elena@example.com", "3", "301"],
    [buildingId, "Jorge Salas", "DNI006", "999111006", "jorge@example.com", "3", "302"]
  ].map((row) => insertOccupant.run(...row).lastInsertRowid);

  const insertReceipt = db.prepare(`
    INSERT INTO receipts (building_id, service_type, receipt_number, period, issue_date, due_date, total_amount_cents, description, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pendiente')
  `);
  const waterId = insertReceipt.run(buildingId, "agua", "AG-2026-001", "enero 2026", "2026-01-03", "2026-01-20", 30000, "Recibo de agua del edificio.").lastInsertRowid;
  const electricityId = insertReceipt.run(buildingId, "luz", "LU-2026-001", "enero 2026", "2026-01-05", "2026-01-22", 42000, "Recibo de luz de áreas comunes.").lastInsertRowid;

  const insertAllocation = db.prepare(`
    INSERT INTO receipt_allocations (receipt_id, occupant_id, assigned_amount_cents, paid_amount_cents, balance_cents, status)
    VALUES (?, ?, ?, 0, ?, 'pendiente')
  `);
  const allocationIds = splitAmount(30000, occupants.length).map((amount, index) => {
    return insertAllocation.run(waterId, occupants[index], amount, amount).lastInsertRowid;
  });

  const insertPayment = db.prepare(`
    INSERT INTO payments (allocation_id, amount_cents, payment_date, payment_method, note)
    VALUES (?, ?, ?, ?, ?)
  `);
  insertPayment.run(allocationIds[0], 5000, "2026-01-10", "yape/plin", "Pago completo");
  insertPayment.run(allocationIds[1], 2500, "2026-01-11", "efectivo", "Pago parcial");
  insertPayment.run(allocationIds[2], 5000, "2026-01-12", "transferencia", "Pago completo");

  allocationIds.forEach(updateAllocationStatus);
  updateReceiptStatus(waterId);
  updateReceiptStatus(electricityId);
});

initDb().then(() => {
  seed();
  console.log("Datos de prueba cargados.");
});
