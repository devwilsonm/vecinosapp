const { db } = require("../db");

function updateAllocationStatus(allocationId) {
  const totalPaid = db.prepare("SELECT COALESCE(SUM(amount_cents), 0) AS total FROM payments WHERE allocation_id = ?").get(allocationId).total;
  const allocation = db.prepare("SELECT assigned_amount_cents FROM receipt_allocations WHERE id = ?").get(allocationId);
  const balance = Math.max(0, allocation.assigned_amount_cents - totalPaid);
  const status = balance === 0 ? "pagado" : totalPaid > 0 ? "pagado parcial" : "pendiente";

  db.prepare(`
    UPDATE receipt_allocations
    SET paid_amount_cents = ?, balance_cents = ?, status = ?
    WHERE id = ?
  `).run(totalPaid, balance, status, allocationId);
}

function updateReceiptStatus(receiptId) {
  const allocations = db.prepare("SELECT paid_amount_cents, balance_cents FROM receipt_allocations WHERE receipt_id = ?").all(receiptId);
  let status = "pendiente";

  if (allocations.length > 0) {
    const allPaid = allocations.every((allocation) => allocation.balance_cents === 0);
    const anyPaid = allocations.some((allocation) => allocation.paid_amount_cents > 0);
    status = allPaid ? "pagado" : anyPaid ? "pagado parcialmente" : "prorrateado";
  }

  db.prepare("UPDATE receipts SET status = ? WHERE id = ?").run(status, receiptId);
}

module.exports = { updateAllocationStatus, updateReceiptStatus };
