const express = require("express");
const { requirePermission } = require("../utils/access");
const { hasBuildingAccess, permittedBuildingIds } = require("../utils/buildingAccess");
const { buildingRepository, dashboardRepository } = require("../infrastructure/container");

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

router.get("/", async (req, res) => {
  const requestedBuildingId = Number(req.query.building_id) || 0;
  const buildings = await buildingRepository.listActive(req.currentUser.role_key === "super_admin" || req.currentUser.role_key === "admin", permittedBuildingIds(req.currentUser), requestedBuildingId);
  const selectedBuildingId = requestedBuildingId && hasBuildingAccess(req.currentUser, requestedBuildingId)
    ? requestedBuildingId
    : buildings[0]?.id || 0;

  const [totalOccupants, totalReceipts, pendingReceipts, recentPayments, debts] = selectedBuildingId
    ? await Promise.all([
      dashboardRepository.countOccupants(selectedBuildingId),
      dashboardRepository.countReceipts(selectedBuildingId),
      dashboardRepository.countPendingReceipts(selectedBuildingId),
      dashboardRepository.recentPayments(selectedBuildingId),
      dashboardRepository.debts(selectedBuildingId)
    ])
    : [0, 0, 0, [], []];
  debts.forEach((debt) => {
    debt.assigned_cents = Number(debt.assigned_cents || 0);
    debt.paid_cents = Number(debt.paid_cents || 0);
    debt.balance_cents = Number(debt.balance_cents || 0);
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