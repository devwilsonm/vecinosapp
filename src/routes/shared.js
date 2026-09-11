const express = require("express");
const { db } = require("../db");

const router = express.Router();

function allocationsByFloor(receiptId) {
  const allocations = db.prepare(`
    SELECT a.*, o.full_name, o.floor, o.unit
    FROM receipt_allocations a
    JOIN occupants o ON a.occupant_id = o.id
    WHERE a.receipt_id = ?
    ORDER BY CAST(o.floor AS INTEGER), o.floor, o.unit, o.full_name
  `).all(receiptId);
  const floorIndex = new Map();
  return allocations.reduce((floors, allocation) => {
    const floorKey = allocation.floor || "Sin piso";
    let group = floorIndex.get(floorKey);
    if (!group) {
      group = {
        floor: floorKey,
        allocations: [],
        assigned_amount_cents: 0,
        paid_amount_cents: 0,
        balance_cents: 0
      };
      floorIndex.set(floorKey, group);
      floors.push(group);
    }
    group.allocations.push(allocation);
    group.assigned_amount_cents += allocation.assigned_amount_cents || 0;
    group.paid_amount_cents += allocation.paid_amount_cents || 0;
    group.balance_cents += allocation.balance_cents || 0;
    return floors;
  }, []);
}

router.get("/allocations/:token", (req, res) => {
  const link = db.prepare("SELECT receipt_id FROM public_allocation_links WHERE token = ?").get(req.params.token);
  if (!link) return res.status(404).render("error", { title: "Enlace no válido", message: "El enlace público no existe o ya no está disponible." });

  const receipt = db.prepare(`
    SELECT r.*, b.name AS building_name
    FROM receipts r
    LEFT JOIN buildings b ON r.building_id = b.id
    WHERE r.id = ?
  `).get(link.receipt_id);
  if (!receipt) return res.status(404).render("error", { title: "No encontrado", message: "El prorrateo ya no está disponible." });

  res.setHeader("Cache-Control", "no-store");
  res.render("allocations/shared", {
    receipt,
    allocationsByFloor: allocationsByFloor(receipt.id),
    sharePath: req.originalUrl
  });
});

module.exports = router;
