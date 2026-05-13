const express = require("express");
const { db } = require("../db");
const { requirePermission } = require("../utils/access");
const { activeBuildingsForUser, buildingFilter, ensureBuildingAccess, hasBuildingAccess } = require("../utils/buildingAccess");
const { safeRedirectPath } = require("../utils/security");
const { cleanText } = require("../utils/validation");

const router = express.Router();

router.use(requirePermission("occupants.manage"));

function redirectWith(res, url, message, type = "success") {
  res.redirect(`${url}?message=${encodeURIComponent(message)}&type=${type}`);
}

function activeBuildings(user, selectedId = 0) {
  return activeBuildingsForUser(db, user, selectedId);
}

function validateOccupant(body, user, id = 0) {
  const errors = [];
  ["full_name", "document", "floor", "unit"].forEach((field) => {
    if (!String(body[field] || "").trim()) errors.push("Completa todos los campos obligatorios.");
  });
  const building = db.prepare("SELECT id, floors FROM buildings WHERE id = ? AND is_active = 1").get(Number(body.building_id));
  if (!building) errors.push("Selecciona un edificio activo.");
  if (building && !hasBuildingAccess(user, building.id)) errors.push("No tienes permisos para usar ese edificio.");
  const floor = Number(body.floor);
  if (building && (!Number.isInteger(floor) || floor < 1 || floor > building.floors)) errors.push("Selecciona un piso válido para el edificio.");
  const duplicate = db.prepare("SELECT id FROM occupants WHERE document = ? AND id != ?").get(cleanText(body.document, 40), id);
  if (duplicate) errors.push("Ya existe un ocupante con ese documento.");
  return [...new Set(errors)];
}

router.get("/", (req, res) => {
  const access = buildingFilter(req.currentUser, "o.building_id", "WHERE");
  const occupants = db.prepare(`
    SELECT o.*, b.name AS building_name
    FROM occupants o
    LEFT JOIN buildings b ON o.building_id = b.id
    ${access.sql}
    ORDER BY o.is_active DESC, b.name, CAST(o.floor AS INTEGER), o.floor, o.unit, o.full_name
  `).all(...access.params);
  const buildingIndex = new Map();
  const groupedOccupants = occupants.reduce((groups, occupant) => {
    const key = occupant.building_name || "Sin edificio";
    let building = buildingIndex.get(key);
    if (!building) {
      building = { total: 0, floors: [], floorIndex: new Map() };
      buildingIndex.set(key, building);
      groups[key] = building;
    }
    building.total += 1;
    const floorKey = occupant.floor || "Sin piso";
    let floor = building.floorIndex.get(floorKey);
    if (!floor) {
      floor = { floor: floorKey, occupants: [], active_count: 0 };
      building.floorIndex.set(floorKey, floor);
      building.floors.push(floor);
    }
    floor.occupants.push(occupant);
    if (occupant.is_active) floor.active_count += 1;
    return groups;
  }, {});
  Object.values(groupedOccupants).forEach((building) => {
    delete building.floorIndex;
  });
  res.render("occupants/index", { groupedOccupants });
});

router.get("/new", (req, res) => {
  res.render("occupants/form", {
    title: "Nuevo ocupante",
    occupant: {
      is_active: 1,
      building_id: Number(req.query.building_id) || "",
      floor: req.query.floor || "",
      return_to: req.query.return_to || ""
    },
    buildings: activeBuildings(req.currentUser),
    errors: []
  });
});

router.post("/", (req, res) => {
  const errors = validateOccupant(req.body, req.currentUser);
  if (errors.length) {
    return res.status(400).render("occupants/form", {
      title: "Nuevo ocupante",
      occupant: req.body,
      buildings: activeBuildings(req.currentUser, Number(req.body.building_id)),
      errors
    });
  }
  db.prepare(`
    INSERT INTO occupants (building_id, full_name, document, phone, email, floor, unit, is_active, created_by, updated_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    Number(req.body.building_id),
    cleanText(req.body.full_name, 160),
    cleanText(req.body.document, 40),
    cleanText(req.body.phone, 40),
    cleanText(req.body.email, 120),
    cleanText(req.body.floor, 20),
    cleanText(req.body.unit, 40),
    req.body.is_active ? 1 : 0,
    req.currentUser.id,
    req.currentUser.id
  );
  redirectWith(res, safeRedirectPath(req.body.return_to, "/occupants"), "Ocupante creado correctamente.");
});

router.get("/:id", (req, res) => {
  const occupant = db.prepare(`
    SELECT o.*, b.name AS building_name
    FROM occupants o
    LEFT JOIN buildings b ON o.building_id = b.id
    WHERE o.id = ?
  `).get(req.params.id);
  if (!occupant) return res.status(404).render("error", { title: "No encontrado", message: "Ocupante no encontrado." });
  if (!ensureBuildingAccess(req, res, occupant.building_id)) return;
  const allocations = db.prepare(`
    SELECT a.*, r.receipt_number, r.period
    FROM receipt_allocations a
    JOIN receipts r ON a.receipt_id = r.id
    WHERE a.occupant_id = ?
    ORDER BY r.due_date DESC
  `).all(req.params.id);
  res.render("occupants/detail", { occupant, allocations });
});

router.get("/:id/edit", (req, res) => {
  const occupant = db.prepare("SELECT * FROM occupants WHERE id = ?").get(req.params.id);
  if (!occupant) return res.status(404).render("error", { title: "No encontrado", message: "Ocupante no encontrado." });
  if (!ensureBuildingAccess(req, res, occupant.building_id)) return;
  res.render("occupants/form", { title: "Editar ocupante", occupant, buildings: activeBuildings(req.currentUser, occupant.building_id || 0), errors: [] });
});

router.put("/:id", (req, res) => {
  const occupant = db.prepare("SELECT * FROM occupants WHERE id = ?").get(req.params.id);
  if (!occupant) return res.status(404).render("error", { title: "No encontrado", message: "Ocupante no encontrado." });
  if (!ensureBuildingAccess(req, res, occupant.building_id)) return;
  const errors = validateOccupant(req.body, req.currentUser, Number(req.params.id));
  if (errors.length) {
    return res.status(400).render("occupants/form", {
      title: "Editar ocupante",
      occupant: { ...req.body, id: req.params.id },
      buildings: activeBuildings(req.currentUser, Number(req.body.building_id)),
      errors
    });
  }
  db.prepare(`
    UPDATE occupants
    SET building_id = ?, full_name = ?, document = ?, phone = ?, email = ?, floor = ?, unit = ?, is_active = ?, updated_by = ?
    WHERE id = ?
  `).run(
    Number(req.body.building_id),
    cleanText(req.body.full_name, 160),
    cleanText(req.body.document, 40),
    cleanText(req.body.phone, 40),
    cleanText(req.body.email, 120),
    cleanText(req.body.floor, 20),
    cleanText(req.body.unit, 40),
    req.body.is_active ? 1 : 0,
    req.currentUser.id,
    req.params.id
  );
  redirectWith(res, `/occupants/${req.params.id}`, "Ocupante actualizado correctamente.");
});

router.post("/:id/deactivate", (req, res) => {
  const occupant = db.prepare("SELECT building_id FROM occupants WHERE id = ?").get(req.params.id);
  if (!occupant) return res.status(404).render("error", { title: "No encontrado", message: "Ocupante no encontrado." });
  if (!ensureBuildingAccess(req, res, occupant.building_id)) return;
  db.prepare("UPDATE occupants SET is_active = 0, updated_by = ? WHERE id = ?").run(req.currentUser.id, req.params.id);
  redirectWith(res, "/occupants", "Ocupante desactivado.");
});

router.delete("/:id", (req, res) => {
  const occupant = db.prepare("SELECT building_id FROM occupants WHERE id = ?").get(req.params.id);
  if (!occupant) return res.status(404).render("error", { title: "No encontrado", message: "Ocupante no encontrado." });
  if (!ensureBuildingAccess(req, res, occupant.building_id)) return;
  const payments = db.prepare(`
    SELECT COUNT(*) AS total
    FROM payments p
    JOIN receipt_allocations a ON p.allocation_id = a.id
    WHERE a.occupant_id = ?
  `).get(req.params.id).total;
  if (payments > 0) {
    db.prepare("UPDATE occupants SET is_active = 0, updated_by = ? WHERE id = ?").run(req.currentUser.id, req.params.id);
    return redirectWith(res, "/occupants", "Tiene pagos asociados; se desactivó en lugar de eliminar.", "warning");
  }
  db.prepare("DELETE FROM occupants WHERE id = ?").run(req.params.id);
  redirectWith(res, "/occupants", "Ocupante eliminado.");
});

module.exports = router;
