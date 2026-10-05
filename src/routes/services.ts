const express = require("express");
const { canAccessAllBuildings, requirePermission } = require("../utils/access");
const { ensureBuildingAccess, permittedBuildingIds } = require("../utils/buildingAccess");
const { cleanText } = require("../utils/validation");
const { servicesForBuildings } = require("../utils/services");
const { buildingRepository, serviceRepository } = require("../infrastructure/container");
const router = express.Router();
router.use(requirePermission("receipts.manage"));
router.use((req, res, next) => {
  if (["super_admin", "admin", "owner"].includes(req.currentUser.role_key)) return next();
  return res.status(403).render("error", { title: "Acceso restringido", message: "Solo el administrador del edificio puede mantener sus servicios." });
});

async function render(req, res, errors = [], status = 200) {
  const buildings = await buildingRepository.listActive(canAccessAllBuildings(req.currentUser), permittedBuildingIds(req.currentUser), 0);
  const services = await servicesForBuildings(buildings);
  return res.status(status).render("services/index", { buildings, services, errors, values: req.body || {} });
}

router.get("/", async (req, res) => render(req, res));
router.post("/", async (req, res) => {
  const buildingId = Number(req.body.building_id);
  if (!ensureBuildingAccess(req, res, buildingId)) return;
  const building = await buildingRepository.findById(buildingId);
  const name = cleanText(req.body.name, 80);
  if (!building || !building.is_active) return render(req, res, ["Selecciona un edificio activo."], 400);
  if (!name || name.toLowerCase() === "all") return render(req, res, ["Ingresa un nombre de servicio válido."], 400);
  const services = await servicesForBuildings([building]);
  if (services.some((service) => service.name.toLocaleLowerCase("es") === name.toLocaleLowerCase("es") || service.label.toLocaleLowerCase("es") === name.toLocaleLowerCase("es"))) {
    return render(req, res, ["Ese servicio ya existe en el edificio. Puedes reactivarlo si está inactivo."], 400);
  }
  await serviceRepository.save(buildingId, name, 1, req.currentUser.id);
  res.redirect("/services?message=" + encodeURIComponent("Servicio agregado correctamente."));
});
router.post("/status", async (req, res) => {
  const buildingId = Number(req.body.building_id);
  if (!ensureBuildingAccess(req, res, buildingId)) return;
  const name = cleanText(req.body.name, 80);
  const services = await serviceRepository.list([buildingId]);
  if (!services.some((service) => service.name === name)) return render(req, res, ["Servicio no encontrado."], 404);
  await serviceRepository.save(buildingId, name, req.body.is_active === "1" ? 1 : 0, req.currentUser.id);
  res.redirect("/services?message=" + encodeURIComponent("Estado del servicio actualizado."));
});
module.exports = router;