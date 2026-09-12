const express = require("express");
const { canAccessAllBuildings, requirePermission } = require("../utils/access");
const { ensureBuildingAccess, permittedBuildingIds } = require("../utils/buildingAccess");
const { cleanText } = require("../utils/validation");
const { buildingRepository } = require("../infrastructure/container");

const router = express.Router();

router.use(requirePermission("buildings.manage"));

function redirectWith(res, url, message, type = "success") {
  res.redirect(`${url}?message=${encodeURIComponent(message)}&type=${type}`);
}

function validateBuilding(body) {
  const errors = [];
  const floors = Number(body.floors);
  if (!cleanText(body.name, 120)) errors.push("El nombre del edificio es obligatorio.");
  if (!Number.isInteger(floors) || floors <= 0 || floors > 80) errors.push("La cantidad de pisos debe estar entre 1 y 80.");
  return { errors, floors };
}

router.get("/", async (req, res) => {
  const buildings = await buildingRepository.listAccessible(canAccessAllBuildings(req.currentUser), permittedBuildingIds(req.currentUser));
  res.render("buildings/index", { buildings });
});

router.get("/new", (req, res) => {
  res.render("buildings/form", { title: "Nuevo edificio", building: { is_active: 1, floors: 1 }, errors: [] });
});

router.post("/", async (req, res) => {
  const { errors, floors } = validateBuilding(req.body);
  if (errors.length) return res.status(400).render("buildings/form", { title: "Nuevo edificio", building: req.body, errors });
  await buildingRepository.create({
    name: cleanText(req.body.name, 120),
    address: cleanText(req.body.address, 255),
    floors,
    notes: cleanText(req.body.notes, 1000),
    is_active: req.body.is_active ? 1 : 0
  }, req.currentUser.id, !canAccessAllBuildings(req.currentUser));
  redirectWith(res, "/buildings", "Edificio creado correctamente.");
});

router.get("/:id", async (req, res) => {
  const building = await buildingRepository.findById(req.params.id);
  if (!building) return res.status(404).render("error", { title: "No encontrado", message: "Edificio no encontrado." });
  if (!ensureBuildingAccess(req, res, building.id)) return;
  const occupants = await buildingRepository.listOccupants(req.params.id);
  const floors = Array.from({ length: building.floors }, (_, index) => String(index + 1));
  occupants.forEach((occupant) => {
    if (!floors.includes(String(occupant.floor))) floors.push(String(occupant.floor));
  });
  floors.sort((a, b) => Number(a) - Number(b) || a.localeCompare(b));
  res.render("buildings/detail", { building, occupants, floors });
});

router.get("/:id/edit", async (req, res) => {
  const building = await buildingRepository.findById(req.params.id);
  if (!building) return res.status(404).render("error", { title: "No encontrado", message: "Edificio no encontrado." });
  if (!ensureBuildingAccess(req, res, building.id)) return;
  res.render("buildings/form", { title: "Editar edificio", building, errors: [] });
});

router.put("/:id", async (req, res) => {
  const building = await buildingRepository.findById(req.params.id);
  if (!building) return res.status(404).render("error", { title: "No encontrado", message: "Edificio no encontrado." });
  if (!ensureBuildingAccess(req, res, building.id)) return;
  const { errors, floors } = validateBuilding(req.body);
  if (errors.length) return res.status(400).render("buildings/form", { title: "Editar edificio", building: { ...req.body, id: req.params.id }, errors });
  await buildingRepository.update(req.params.id, {
    name: cleanText(req.body.name, 120),
    address: cleanText(req.body.address, 255),
    floors,
    notes: cleanText(req.body.notes, 1000),
    is_active: req.body.is_active ? 1 : 0
  }, req.currentUser.id);
  redirectWith(res, `/buildings/${req.params.id}`, "Edificio actualizado correctamente.");
});

router.post("/:id/deactivate", async (req, res) => {
  if (!ensureBuildingAccess(req, res, req.params.id)) return;
  await buildingRepository.deactivate(req.params.id, req.currentUser.id);
  redirectWith(res, "/buildings", "Edificio desactivado.");
});

router.delete("/:id", async (req, res) => {
  if (!ensureBuildingAccess(req, res, req.params.id)) return;
  const occupants = await buildingRepository.countOccupants(req.params.id);
  if (occupants > 0) {
    await buildingRepository.deactivate(req.params.id, req.currentUser.id);
    return redirectWith(res, "/buildings", "El edificio tiene ocupantes; se desactivó en lugar de eliminar.", "warning");
  }
  await buildingRepository.remove(req.params.id);
  redirectWith(res, "/buildings", "Edificio eliminado.");
});

module.exports = router;