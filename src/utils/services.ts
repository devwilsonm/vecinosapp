const { serviceRepository } = require("../infrastructure/container");
const defaults = { agua: "Agua", luz: "Luz", internet: "Internet", otro: "Otro" };

async function servicesForBuildings(buildings) {
  const custom = await serviceRepository.list(buildings.map((building) => Number(building.id)));
  return buildings.flatMap((building) => [
    ...Object.entries(defaults).map(([name, label]) => ({ building_id: building.id, name, label, is_active: 1, standard: true })),
    ...custom.filter((service) => Number(service.building_id) === Number(building.id)).map((service) => ({ ...service, label: service.name, standard: false }))
  ]).sort((a, b) => Number(a.name === "otro") - Number(b.name === "otro"));
}

module.exports = { servicesForBuildings };