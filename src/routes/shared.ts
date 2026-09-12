const express = require("express");
const { publicAllocationRepository } = require("../infrastructure/container");

const router = express.Router();

async function allocationsByFloor(receiptId) {
  const allocations = await publicAllocationRepository.listAllocations(receiptId);
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

router.get("/allocations/:token", async (req, res) => {
  const link = await publicAllocationRepository.findLinkByToken(req.params.token);
  if (!link) return res.status(404).render("error", { title: "Enlace no válido", message: "El enlace público no existe o ya no está disponible." });
  if (publicAllocationRepository.isLinkExpired(link)) {
    return res.status(404).render("error", { title: "Enlace expirado", message: "El enlace público expiró. Solicita uno nuevo." });
  }

  const receipt = await publicAllocationRepository.findReceipt(link.receipt_id);
  if (!receipt) return res.status(404).render("error", { title: "No encontrado", message: "El prorrateo ya no está disponible." });

  res.setHeader("Cache-Control", "no-store");
  res.render("allocations/shared", {
    receipt,
    allocationsByFloor: await allocationsByFloor(receipt.id),
    sharePath: req.originalUrl
  });
});

module.exports = router;