const express = require("express");
const { requirePermission } = require("../utils/access");
const { ensureBuildingAccess, hasBuildingAccess, permittedBuildingIds } = require("../utils/buildingAccess");
const { safeRedirectPath } = require("../utils/security");
const { cleanText } = require("../utils/validation");
const { buildingRepository, occupantRepository } = require("../infrastructure/container");

const router = express.Router();

type OccupantGroup = {
  total: number;
  floors: Array<{ floor: string; occupants: Record<string, any>[]; active_count: number }>;
  floorIndex: Map<string, { floor: string; occupants: Record<string, any>[]; active_count: number }>;
};

router.use(requirePermission("occupants.manage"));

function redirectWith(res, url, message, type = "success") {
  res.redirect(`${url}?message=${encodeURIComponent(message)}&type=${type}`);
}

async function activeBuildings(user, selectedId = 0) {
  return buildingRepository.listActive(user.role_key === "super_admin" || user.role_key === "admin", permittedBuildingIds(user), selectedId);
}

async function validateOccupant(body, user, id = 0) {
  const errors = [];
  ["full_name", "document", "floor", "unit"].forEach((field) => {
    if (!String(body[field] || "").trim()) errors.push("Completa todos los campos obligatorios.");
  });
  const building = await occupantRepository.findBuildingForValidation(Number(body.building_id));
  if (!building) errors.push("Selecciona un edificio activo.");
  if (building && !hasBuildingAccess(user, building.id)) errors.push("No tienes permisos para usar ese edificio.");
  const floor = Number(body.floor);
  if (building && (!Number.isInteger(floor) || floor < 1 || floor > building.floors)) errors.push("Selecciona un piso válido para el edificio.");
  const duplicate = await occupantRepository.findDuplicateDocument(cleanText(body.document, 40), id);
  if (duplicate) errors.push("Ya existe un ocupante con ese documento.");
  return [...new Set(errors)];
}

router.get("/", async (req, res) => {
  const occupants = await occupantRepository.listAccessible(req.currentUser.role_key === "super_admin" || req.currentUser.role_key === "admin", permittedBuildingIds(req.currentUser));
  const buildingIndex = new Map<string, OccupantGroup>();
  const groupedOccupants = (occupants as Record<string, any>[]).reduce((groups: Record<string, OccupantGroup>, occupant) => {
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

router.get("/new", async (req, res) => {
  res.render("occupants/form", {
    title: "Nuevo ocupante",
    occupant: {
      is_active: 1,
      building_id: Number(req.query.building_id) || "",
      floor: req.query.floor || "",
      return_to: req.query.return_to || ""
    },
    buildings: await activeBuildings(req.currentUser),
    errors: []
  });
});

router.post("/", async (req, res) => {
  const errors = await validateOccupant(req.body, req.currentUser);
  if (errors.length) {
    return res.status(400).render("occupants/form", {
      title: "Nuevo ocupante",
      occupant: req.body,
      buildings: await activeBuildings(req.currentUser, Number(req.body.building_id)),
      errors
    });
  }
  await occupantRepository.create({
    building_id: Number(req.body.building_id),
    full_name: cleanText(req.body.full_name, 160),
    document: cleanText(req.body.document, 40),
    phone: cleanText(req.body.phone, 40),
    email: cleanText(req.body.email, 120),
    floor: cleanText(req.body.floor, 20),
    unit: cleanText(req.body.unit, 40),
    is_active: req.body.is_active ? 1 : 0
  }, req.currentUser.id);
  redirectWith(res, safeRedirectPath(req.body.return_to, "/occupants"), "Ocupante creado correctamente.");
});

router.get("/:id", async (req, res) => {
  const occupant = await occupantRepository.findWithBuilding(req.params.id);
  if (!occupant) return res.status(404).render("error", { title: "No encontrado", message: "Ocupante no encontrado." });
  if (!ensureBuildingAccess(req, res, occupant.building_id)) return;
  const allocations = await occupantRepository.listAllocations(req.params.id);
  res.render("occupants/detail", { occupant, allocations });
});

router.get("/:id/edit", async (req, res) => {
  const occupant = await occupantRepository.findById(req.params.id);
  if (!occupant) return res.status(404).render("error", { title: "No encontrado", message: "Ocupante no encontrado." });
  if (!ensureBuildingAccess(req, res, occupant.building_id)) return;
  res.render("occupants/form", { title: "Editar ocupante", occupant, buildings: await activeBuildings(req.currentUser, occupant.building_id || 0), errors: [] });
});

router.put("/:id", async (req, res) => {
  const occupant = await occupantRepository.findById(req.params.id);
  if (!occupant) return res.status(404).render("error", { title: "No encontrado", message: "Ocupante no encontrado." });
  if (!ensureBuildingAccess(req, res, occupant.building_id)) return;
  const errors = await validateOccupant(req.body, req.currentUser, Number(req.params.id));
  if (errors.length) {
    return res.status(400).render("occupants/form", {
      title: "Editar ocupante",
      occupant: { ...req.body, id: req.params.id },
      buildings: await activeBuildings(req.currentUser, Number(req.body.building_id)),
      errors
    });
  }
  await occupantRepository.update(req.params.id, {
    building_id: Number(req.body.building_id),
    full_name: cleanText(req.body.full_name, 160),
    document: cleanText(req.body.document, 40),
    phone: cleanText(req.body.phone, 40),
    email: cleanText(req.body.email, 120),
    floor: cleanText(req.body.floor, 20),
    unit: cleanText(req.body.unit, 40),
    is_active: req.body.is_active ? 1 : 0
  }, req.currentUser.id);
  redirectWith(res, `/occupants/${req.params.id}`, "Ocupante actualizado correctamente.");
});

router.post("/:id/deactivate", async (req, res) => {
  const occupant = await occupantRepository.findById(req.params.id);
  if (!occupant) return res.status(404).render("error", { title: "No encontrado", message: "Ocupante no encontrado." });
  if (!ensureBuildingAccess(req, res, occupant.building_id)) return;
  await occupantRepository.deactivate(req.params.id, req.currentUser.id);
  redirectWith(res, "/occupants", "Ocupante desactivado.");
});

router.delete("/:id", async (req, res) => {
  const occupant = await occupantRepository.findById(req.params.id);
  if (!occupant) return res.status(404).render("error", { title: "No encontrado", message: "Ocupante no encontrado." });
  if (!ensureBuildingAccess(req, res, occupant.building_id)) return;
  const payments = await occupantRepository.countPayments(req.params.id);
  if (payments > 0) {
    await occupantRepository.deactivate(req.params.id, req.currentUser.id);
    return redirectWith(res, "/occupants", "Tiene pagos asociados; se desactivó en lugar de eliminar.", "warning");
  }
  await occupantRepository.remove(req.params.id);
  redirectWith(res, "/occupants", "Ocupante eliminado.");
});

module.exports = router;
