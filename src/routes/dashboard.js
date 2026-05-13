const express = require("express");
const { db } = require("../db");
const { requirePermission } = require("../utils/access");
const { activeBuildingsForUser, hasBuildingAccess } = require("../utils/buildingAccess");

const router = express.Router();

router.use(requirePermission("dashboard.view"));

function progressClass(percent) {
  if (percent >= 80) return "percent-good";
  if (percent >= 40) return "percent-warning";
  return "percent-danger";
}

function paidPercent(paidCents, assignedCents) {
  if (!assignedCents || assignedCents <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((paidCents / assignedCents) * 100)));
}

router.get("/", (req, res) => {
  const requestedBuildingId = Number(req.query.building_id) || 0;
  const buildings = activeBuildingsForUser(db, req.currentUser, requestedBuildingId);
  const selectedBuildingId = requestedBuildingId && hasBuildingAccess(req.currentUser, requestedBuildingId)
    ? requestedBuildingId
    : buildings[0]?.id || 0;

  const totalOccupants = selectedBuildingId
    ? db.prepare("SELECT COUNT(*) AS total FROM occupants WHERE building_id = ?").get(selectedBuildingId).total
    : 0;
  const totalReceipts = selectedBuildingId
    ? db.prepare("SELECT COUNT(*) AS total FROM receipts WHERE building_id = ?").get(selectedBuildingId).total
    : 0;
  const pendingReceipts = selectedBuildingId
    ? db.prepare("SELECT COUNT(*) AS total FROM receipts WHERE building_id = ? AND status != 'pagado'").get(selectedBuildingId).total
    : 0;
  const recentPayments = db.prepare(`
    SELECT p.*, o.full_name, r.receipt_number
    FROM payments p
    JOIN receipt_allocations a ON p.allocation_id = a.id
    JOIN occupants o ON a.occupant_id = o.id
    JOIN receipts r ON a.receipt_id = r.id
    WHERE r.building_id = ?
    ORDER BY p.payment_date DESC, p.id DESC
    LIMIT 5
  `).all(selectedBuildingId);
  const debts = db.prepare(`
    SELECT
      o.id,
      o.full_name,
      o.floor,
      o.unit,
      SUM(a.assigned_amount_cents) AS assigned_cents,
      SUM(a.paid_amount_cents) AS paid_cents,
      SUM(a.balance_cents) AS balance_cents
    FROM occupants o
    JOIN receipt_allocations a ON o.id = a.occupant_id
    JOIN receipts r ON a.receipt_id = r.id
    WHERE a.balance_cents > 0
      AND r.building_id = ?
    GROUP BY o.id
    ORDER BY CAST(o.floor AS INTEGER), o.floor, o.unit, o.full_name
  `).all(selectedBuildingId);
  debts.forEach((debt) => {
    debt.paid_percent = paidPercent(debt.paid_cents, debt.assigned_cents);
    debt.percent_class = progressClass(debt.paid_percent);
  });
  const floorIndex = new Map();
  const debtsByFloor = debts.reduce((floors, debt) => {
    const floorKey = debt.floor || "Sin piso";
    let group = floorIndex.get(floorKey);
    if (!group) {
      group = {
        floor: floorKey,
        occupants: [],
        assigned_cents: 0,
        paid_cents: 0,
        balance_cents: 0,
        paid_percent: 0,
        percent_class: "percent-danger"
      };
      floorIndex.set(floorKey, group);
      floors.push(group);
    }
    group.occupants.push(debt);
    group.assigned_cents += debt.assigned_cents || 0;
    group.paid_cents += debt.paid_cents || 0;
    group.balance_cents += debt.balance_cents || 0;
    return floors;
  }, []);
  debtsByFloor.forEach((floor) => {
    floor.paid_percent = paidPercent(floor.paid_cents, floor.assigned_cents);
    floor.percent_class = progressClass(floor.paid_percent);
  });

  res.render("dashboard", {
    buildings,
    selectedBuildingId,
    totalOccupants,
    totalReceipts,
    pendingReceipts,
    recentPayments,
    debtsByFloor
  });
});

module.exports = router;
