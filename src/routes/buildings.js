const express = require("express");
const { db } = require("../db");
const { canAccessAllBuildings, requirePermission } = require("../utils/access");
const { buildingFilter, ensureBuildingAccess } = require("../utils/buildingAccess");
const { cleanText } = require("../utils/validation");

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

router.get("/", (req, res) => {
  const access = buildingFilter(req.currentUser, "b.id", "WHERE");
  const buildings = db.prepare(`
    SELECT b.*, COUNT(o.id) AS occupant_count
    FROM buildings b
    LEFT JOIN occupants o ON b.id = o.building_id
    ${access.sql}
    GROUP BY b.id
    ORDER BY b.is_active DESC, b.name
  `).all(...access.params);
  res.render("buildings/index", { buildings });
});

router.get("/new", (req, res) => {
  res.render("buildings/form", { title: "Nuevo edificio", building: { is_active: 1, floors: 1 }, errors: [] });
});

router.post("/", (req, res) => {
  const { errors, floors } = validateBuilding(req.body);
  if (errors.length) return res.status(400).render("buildings/form", { title: "Nuevo edificio", building: req.body, errors });
  const save = db.transaction(() => {
    const buildingId = db.prepare(`
      INSERT INTO buildings (name, address, floors, notes, is_active, created_by, updated_by)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      cleanText(req.body.name, 120),
      cleanText(req.body.address, 255),
      floors,
      cleanText(req.body.notes, 1000),
      req.body.is_active ? 1 : 0,
      req.currentUser.id,
      req.currentUser.id
    ).lastInsertRowid;
    if (!canAccessAllBuildings(req.currentUser)) {
      db.prepare("INSERT INTO user_buildings (user_id, building_id) VALUES (?, ?)").run(req.currentUser.id, buildingId);
    }
  });
  save();
  redirectWith(res, "/buildings", "Edificio creado correctamente.");
});

router.get("/:id", (req, res) => {
  const building = db.prepare("SELECT * FROM buildings WHERE id = ?").get(req.params.id);
  if (!building) return res.status(404).render("error", { title: "No encontrado", message: "Edificio no encontrado." });
  if (!ensureBuildingAccess(req, res, building.id)) return;
  const occupants = db.prepare(`
    SELECT *
    FROM occupants
    WHERE building_id = ?
    ORDER BY CAST(floor AS INTEGER), floor, unit, full_name
  `).all(req.params.id);
  const floors = Array.from({ length: building.floors }, (_, index) => String(index + 1));
  occupants.forEach((occupant) => {
    if (!floors.includes(String(occupant.floor))) floors.push(String(occupant.floor));
  });
  floors.sort((a, b) => Number(a) - Number(b) || a.localeCompare(b));
  res.render("buildings/detail", { building, occupants, floors });
});

router.get("/:id/edit", (req, res) => {
  const building = db.prepare("SELECT * FROM buildings WHERE id = ?").get(req.params.id);
  if (!building) return res.status(404).render("error", { title: "No encontrado", message: "Edificio no encontrado." });
  if (!ensureBuildingAccess(req, res, building.id)) return;
  res.render("buildings/form", { title: "Editar edificio", building, errors: [] });
});

router.put("/:id", (req, res) => {
  const building = db.prepare("SELECT * FROM buildings WHERE id = ?").get(req.params.id);
  if (!building) return res.status(404).render("error", { title: "No encontrado", message: "Edificio no encontrado." });
  if (!ensureBuildingAccess(req, res, building.id)) return;
  const { errors, floors } = validateBuilding(req.body);
  if (errors.length) return res.status(400).render("buildings/form", { title: "Editar edificio", building: { ...req.body, id: req.params.id }, errors });
  db.prepare(`
    UPDATE buildings
    SET name = ?, address = ?, floors = ?, notes = ?, is_active = ?, updated_by = ?
    WHERE id = ?
  `).run(
    cleanText(req.body.name, 120),
    cleanText(req.body.address, 255),
    floors,
    cleanText(req.body.notes, 1000),
    req.body.is_active ? 1 : 0,
    req.currentUser.id,
    req.params.id
  );
  redirectWith(res, `/buildings/${req.params.id}`, "Edificio actualizado correctamente.");
});

router.post("/:id/deactivate", (req, res) => {
  if (!ensureBuildingAccess(req, res, req.params.id)) return;
  db.prepare("UPDATE buildings SET is_active = 0, updated_by = ? WHERE id = ?").run(req.currentUser.id, req.params.id);
  redirectWith(res, "/buildings", "Edificio desactivado.");
});

router.delete("/:id", (req, res) => {
  if (!ensureBuildingAccess(req, res, req.params.id)) return;
  const occupants = db.prepare("SELECT COUNT(*) AS total FROM occupants WHERE building_id = ?").get(req.params.id).total;
  if (occupants > 0) {
    db.prepare("UPDATE buildings SET is_active = 0, updated_by = ? WHERE id = ?").run(req.currentUser.id, req.params.id);
    return redirectWith(res, "/buildings", "El edificio tiene ocupantes; se desactivó en lugar de eliminar.", "warning");
  }
  db.prepare("DELETE FROM buildings WHERE id = ?").run(req.params.id);
  redirectWith(res, "/buildings", "Edificio eliminado.");
});

module.exports = router;
