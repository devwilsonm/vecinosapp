const express = require("express");
const { db } = require("../db");
const { requirePermission } = require("../utils/access");
const { buildingFilter } = require("../utils/buildingAccess");

const router = express.Router();

router.use(requirePermission("reports.view"));

router.get("/", (req, res) => {
  const access = buildingFilter(req.currentUser, "r.building_id");
  const debtsByOccupant = db.prepare(`
    SELECT o.full_name, o.floor, o.unit, SUM(a.balance_cents) AS balance_cents
    FROM occupants o
    JOIN receipt_allocations a ON o.id = a.occupant_id
    JOIN receipts r ON a.receipt_id = r.id
    WHERE a.balance_cents > 0
      ${access.sql}
    GROUP BY o.id
    ORDER BY CAST(o.floor AS INTEGER), o.floor, o.unit, o.full_name
  `).all(...access.params);
  const floorIndex = new Map();
  const debtsByFloor = debtsByOccupant.reduce((floors, debt) => {
    const floorKey = debt.floor || "Sin piso";
    let group = floorIndex.get(floorKey);
    if (!group) {
      group = { floor: floorKey, occupants: [], balance_cents: 0 };
      floorIndex.set(floorKey, group);
      floors.push(group);
    }
    group.occupants.push(debt);
    group.balance_cents += debt.balance_cents || 0;
    return floors;
  }, []);
  const pendingReceipts = db.prepare(`
    SELECT *
    FROM receipts r
    WHERE status != 'pagado'
      ${access.sql}
    ORDER BY due_date
  `).all(...access.params);
  const paymentsByPeriod = db.prepare(`
    SELECT r.period, SUM(p.amount_cents) AS total_cents
    FROM payments p
    JOIN receipt_allocations a ON p.allocation_id = a.id
    JOIN receipts r ON a.receipt_id = r.id
    WHERE 1 = 1
      ${access.sql}
    GROUP BY r.period
    ORDER BY r.period
  `).all(...access.params);
  const receiptTotals = db.prepare(`
    SELECT r.*, COALESCE(SUM(a.paid_amount_cents), 0) AS collected_cents, COALESCE(SUM(a.balance_cents), 0) AS balance_cents
    FROM receipts r
    LEFT JOIN receipt_allocations a ON r.id = a.receipt_id
    WHERE 1 = 1
      ${access.sql}
    GROUP BY r.id
    ORDER BY r.created_at DESC
  `).all(...access.params);
  res.render("reports/index", { debtsByFloor, pendingReceipts, paymentsByPeriod, receiptTotals });
});

module.exports = router;
