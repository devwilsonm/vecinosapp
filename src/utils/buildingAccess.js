const { canAccessAllBuildings } = require("./access");

function permittedBuildingIds(user) {
  return Array.isArray(user?.building_ids) ? user.building_ids.map(Number).filter(Number.isInteger) : [];
}

function hasBuildingAccess(user, buildingId) {
  if (canAccessAllBuildings(user)) return true;
  return permittedBuildingIds(user).includes(Number(buildingId));
}

function buildingFilter(user, columnName, prefix = "AND") {
  if (canAccessAllBuildings(user)) return { sql: "", params: [] };
  const ids = permittedBuildingIds(user);
  if (!ids.length) return { sql: ` ${prefix} 1 = 0`, params: [] };
  return { sql: ` ${prefix} ${columnName} IN (${ids.map(() => "?").join(",")})`, params: ids };
}

function activeBuildingsForUser(db, user, selectedId = 0) {
  if (canAccessAllBuildings(user)) {
    return db.prepare("SELECT * FROM buildings WHERE is_active = 1 OR id = ? ORDER BY name").all(selectedId);
  }
  const ids = permittedBuildingIds(user);
  if (!ids.length) return [];
  return db.prepare(`
    SELECT *
    FROM buildings
    WHERE id IN (${ids.map(() => "?").join(",")})
      AND (is_active = 1 OR id = ?)
    ORDER BY name
  `).all(...ids, selectedId);
}

function ensureBuildingAccess(req, res, buildingId) {
  if (hasBuildingAccess(req.currentUser, buildingId)) return true;
  res.status(403).render("error", {
    title: "Acceso restringido",
    message: "No tienes permisos para acceder a este edificio."
  });
  return false;
}

module.exports = {
  activeBuildingsForUser,
  buildingFilter,
  ensureBuildingAccess,
  hasBuildingAccess,
  permittedBuildingIds
};
