const express = require("express");
const { requirePermission } = require("../utils/access");
const { canAccessAllBuildings } = require("../utils/access");
const { permittedBuildingIds } = require("../utils/buildingAccess");
const { reportRepository } = require("../infrastructure/container");

const router = express.Router();

router.use(requirePermission("reports.view"));

router.get("/", async (req, res) => {
  const allBuildings = canAccessAllBuildings(req.currentUser);
  const buildingIds = permittedBuildingIds(req.currentUser);
  const [debtsByOccupant, pendingReceipts, paymentsByPeriod, receiptTotals] = await Promise.all([
    reportRepository.debtsByOccupant(allBuildings, buildingIds),
    reportRepository.pendingReceipts(allBuildings, buildingIds),
    reportRepository.paymentsByPeriod(allBuildings, buildingIds),
    reportRepository.receiptTotals(allBuildings, buildingIds)
  ]);
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
    debt.balance_cents = Number(debt.balance_cents || 0);
    group.balance_cents += debt.balance_cents;
    return floors;
  }, []);
  res.render("reports/index", { debtsByFloor, pendingReceipts, paymentsByPeriod, receiptTotals });
});

module.exports = router;