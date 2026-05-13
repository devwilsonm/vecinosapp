function hasRole(user, roleKey) {
  return user?.role_key === roleKey;
}

function isSuperAdmin(user) {
  return hasRole(user, "super_admin");
}

function canAccessAllBuildings(user) {
  return isSuperAdmin(user) || hasRole(user, "admin");
}

function hasPermission(user, permissionKey) {
  if (isSuperAdmin(user)) return true;
  return Array.isArray(user?.permissions) && user.permissions.includes(permissionKey);
}

function requireSuperAdmin(req, res, next) {
  if (isSuperAdmin(req.currentUser)) return next();
  return res.status(403).render("error", {
    title: "Acceso restringido",
    message: "No tienes permisos para ingresar a esta sección."
  });
}

function requirePermission(permissionKey) {
  return (req, res, next) => {
    if (hasPermission(req.currentUser, permissionKey)) return next();
    return res.status(403).render("error", {
      title: "Acceso restringido",
      message: "No tienes permisos para realizar esta acción."
    });
  };
}

module.exports = { canAccessAllBuildings, hasPermission, hasRole, isSuperAdmin, requirePermission, requireSuperAdmin };
