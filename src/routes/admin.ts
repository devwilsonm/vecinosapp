const express = require("express");
const { hashPassword } = require("../utils/auth");
const { requirePublicLinkSettingsAccess, requireSuperAdmin } = require("../utils/access");
const { cleanText } = require("../utils/validation");
const { apiLogSummary, countApiLogs, listApiLogs } = require("../infrastructure/database/logDatabase");
const { buildingRepository, publicLinkSettingsRepository, roleRepository, userRepository } = require("../infrastructure/container");

const router = express.Router();

const MAX_PUBLIC_LINK_TTL_HOURS = 48;

router.use((req, res, next) => {
  if (req.path.startsWith("/public-links")) return requirePublicLinkSettingsAccess(req, res, next);
  return requireSuperAdmin(req, res, next);
});

function redirectWith(res, url, message, type = "success") {
  res.redirect(`${url}?message=${encodeURIComponent(message)}&type=${type}`);
}

function selectedIds(value) {
  if (!value) return [];
  return (Array.isArray(value) ? value : [value]).map(Number).filter((id) => Number.isInteger(id) && id > 0);
}

async function roleOptions() {
  return roleRepository.listActive();
}

async function buildingOptions() {
  return buildingRepository.listAllActive();
}

async function permissionsByModule() {
  return roleRepository.permissionsByModule();
}

function parsePublicLinkHours(value) {
  const text = String(value ?? "").trim();
  if (!/^\d+$/.test(text)) return null;
  const hours = Number(text);
  return Number.isSafeInteger(hours) && hours >= 1 && hours <= MAX_PUBLIC_LINK_TTL_HOURS ? hours : null;
}

async function publicLinkSettingsData() {
  const [buildings, defaultHours] = await Promise.all([
    buildingRepository.listAllActive(),
    publicLinkSettingsRepository.defaultHours()
  ]);
  return { buildings, defaultHours };
}

async function renderPublicLinkSettings(res, status = 200, state: Record<string, any> = {}) {
  const data = await publicLinkSettingsData();
  res.status(status).render("admin/public-links", {
    ...data,
    defaultHours: state.defaultHours ?? data.defaultHours,
    errors: state.errors || []
  });
}

router.get("/", async (req, res) => {
  const counts = {
    users: await userRepository.count(),
    roles: await roleRepository.count(),
    permissions: (await roleRepository.listPermissions()).length
  };
  res.render("admin/index", { counts });
});

router.get("/users", async (req, res) => {
  const users = await userRepository.listWithRoles();
  res.render("admin/users/index", { users });
});

router.get("/users/new", async (req, res) => {
  res.render("admin/users/form", {
    title: "Nuevo usuario",
    user: { is_active: 1 },
    roles: await roleOptions(),
    buildings: await buildingOptions(),
    assignedBuildings: [],
    errors: []
  });
});

router.post("/users", async (req, res) => {
  const errors = [];
  const email = cleanText(req.body.email, 160).toLowerCase();
  const role = await roleRepository.findActiveById(Number(req.body.role_id));
  if (!cleanText(req.body.full_name, 160)) errors.push("El nombre completo es obligatorio.");
  if (!email || !email.includes("@")) errors.push("El correo electrónico es obligatorio y debe ser válido.");
  if (!role) errors.push("Selecciona un perfil activo.");
  if (!String(req.body.password || "").trim() || String(req.body.password).length < 6) errors.push("La contraseña debe tener al menos 6 caracteres.");
  const duplicate = await userRepository.emailExists(email);
  if (duplicate) errors.push("Ya existe un usuario con ese correo.");

  const assignedBuildings = selectedIds(req.body.building_ids);
  if (errors.length) {
    return res.status(400).render("admin/users/form", {
      title: "Nuevo usuario",
      user: req.body,
      roles: await roleOptions(),
      buildings: await buildingOptions(),
      assignedBuildings,
      errors
    });
  }

  await userRepository.create({ role_id: Number(req.body.role_id), full_name: cleanText(req.body.full_name, 160), email, password_hash: hashPassword(req.body.password), is_active: req.body.is_active ? 1 : 0 }, assignedBuildings, req.currentUser.id);
  redirectWith(res, "/admin/users", "Usuario creado correctamente.");
});

router.get("/users/:id/edit", async (req, res) => {
  const user = await userRepository.findById(req.params.id);
  if (!user) return res.status(404).render("error", { title: "No encontrado", message: "Usuario no encontrado." });
  const assignedBuildings = await userRepository.listAssignedBuildingIds(user.id);
  res.render("admin/users/form", {
    title: "Editar usuario",
    user,
    roles: await roleOptions(),
    buildings: await buildingOptions(),
    assignedBuildings,
    errors: []
  });
});

router.put("/users/:id", async (req, res) => {
  const user = await userRepository.findById(req.params.id);
  if (!user) return res.status(404).render("error", { title: "No encontrado", message: "Usuario no encontrado." });

  const errors = [];
  const email = cleanText(req.body.email, 160).toLowerCase();
  const role = await roleRepository.findActiveById(Number(req.body.role_id));
  if (!cleanText(req.body.full_name, 160)) errors.push("El nombre completo es obligatorio.");
  if (!email || !email.includes("@")) errors.push("El correo electrónico es obligatorio y debe ser válido.");
  if (!role) errors.push("Selecciona un perfil activo.");
  if (req.body.password && String(req.body.password).length < 6) errors.push("La contraseña debe tener al menos 6 caracteres.");
  if (Number(req.params.id) === Number(req.currentUser.id) && (role?.key !== "super_admin" || !req.body.is_active)) {
    errors.push("No puedes quitarte tu propio acceso de Super Admin.");
  }
  const duplicate = await userRepository.emailExists(email, Number(req.params.id));
  if (duplicate) errors.push("Ya existe otro usuario con ese correo.");

  const assignedBuildings = selectedIds(req.body.building_ids);
  if (errors.length) {
    return res.status(400).render("admin/users/form", {
      title: "Editar usuario",
      user: { ...req.body, id: req.params.id },
      roles: await roleOptions(),
      buildings: await buildingOptions(),
      assignedBuildings,
      errors
    });
  }

  await userRepository.update(req.params.id, { role_id: Number(req.body.role_id), full_name: cleanText(req.body.full_name, 160), email, password_hash: req.body.password ? hashPassword(req.body.password) : undefined, is_active: req.body.is_active ? 1 : 0 }, assignedBuildings, req.currentUser.id);
  redirectWith(res, "/admin/users", "Usuario actualizado correctamente.");
});

router.post("/users/:id/deactivate", async (req, res) => {
  if (Number(req.params.id) === Number(req.currentUser.id)) {
    return redirectWith(res, "/admin/users", "No puedes desactivar tu propio usuario.", "danger");
  }
  await userRepository.deactivate(req.params.id, req.currentUser.id);
  redirectWith(res, "/admin/users", "Usuario desactivado.");
});

router.get("/roles", async (req, res) => {
  const roles = await roleRepository.list();
  res.render("admin/roles/index", { roles });
});

router.get("/roles/new", async (req, res) => {
  res.render("admin/roles/form", {
    title: "Nuevo perfil",
    role: { is_active: 1 },
    permissionsByModule: await permissionsByModule(),
    selectedPermissions: [],
    errors: []
  });
});

router.post("/roles", async (req, res) => {
  const errors = [];
  const key = cleanText(req.body.key, 80).toLowerCase().replace(/[^a-z0-9_.-]/g, "_");
  if (!cleanText(req.body.name, 120)) errors.push("El nombre del perfil es obligatorio.");
  if (!key) errors.push("La clave del perfil es obligatoria.");
  if (await roleRepository.keyExists(key)) errors.push("Ya existe un perfil con esa clave.");
  const selectedPermissions = selectedIds(req.body.permission_ids);

  if (errors.length) {
    return res.status(400).render("admin/roles/form", {
      title: "Nuevo perfil",
      role: { ...req.body, key },
      permissionsByModule: await permissionsByModule(),
      selectedPermissions,
      errors
    });
  }

  await roleRepository.create({ name: cleanText(req.body.name, 120), key, description: cleanText(req.body.description, 500), is_active: req.body.is_active ? 1 : 0 }, selectedPermissions, req.currentUser.id);
  redirectWith(res, "/admin/roles", "Perfil creado correctamente.");
});

router.get("/roles/:id/edit", async (req, res) => {
  const role = await roleRepository.findById(req.params.id);
  if (!role) return res.status(404).render("error", { title: "No encontrado", message: "Perfil no encontrado." });
  const selectedPermissions = await roleRepository.listSelectedPermissions(role.id);
  res.render("admin/roles/form", {
    title: "Editar perfil",
    role,
    permissionsByModule: await permissionsByModule(),
    selectedPermissions,
    errors: []
  });
});

router.put("/roles/:id", async (req, res) => {
  const role = await roleRepository.findById(req.params.id);
  if (!role) return res.status(404).render("error", { title: "No encontrado", message: "Perfil no encontrado." });
  const errors = [];
  if (!cleanText(req.body.name, 120)) errors.push("El nombre del perfil es obligatorio.");
  if (role.key === "super_admin" && !req.body.is_active) errors.push("El perfil Super Admin no puede desactivarse.");
  const selectedPermissions = selectedIds(req.body.permission_ids);

  if (errors.length) {
    return res.status(400).render("admin/roles/form", {
      title: "Editar perfil",
      role: { ...req.body, id: req.params.id, key: role.key, is_system: role.is_system },
      permissionsByModule: await permissionsByModule(),
      selectedPermissions,
      errors
    });
  }

  await roleRepository.update(req.params.id, { name: cleanText(req.body.name, 120), description: cleanText(req.body.description, 500), is_active: req.body.is_active ? 1 : 0 }, selectedPermissions, req.currentUser.id);
  redirectWith(res, "/admin/roles", "Perfil actualizado correctamente.");
});

router.get("/permissions", async (req, res) => {
  res.render("admin/permissions/index", { permissionsByModule: await permissionsByModule() });
});

router.get("/maintenance", async (req, res) => {
  const logs = await userRepository.maintenanceSummary();
  res.render("admin/maintenance", { logs });
});

router.get("/public-links", async (req, res) => {
  await renderPublicLinkSettings(res);
});

router.post("/public-links/default", async (req, res) => {
  const hours = parsePublicLinkHours(req.body.hours);
  if (hours === null) {
    return renderPublicLinkSettings(res, 400, {
      defaultHours: req.body.hours,
      errors: [`Ingresa un número entero de horas entre 1 y ${MAX_PUBLIC_LINK_TTL_HOURS}.`]
    });
  }
  await publicLinkSettingsRepository.updateDefaultHours(hours);
  redirectWith(res, "/admin/public-links", "Duración predeterminada actualizada correctamente.");
});

router.post("/public-links/buildings/:id", async (req, res) => {
  const building = await buildingRepository.findById(req.params.id);
  if (!building || !building.is_active) return redirectWith(res, "/admin/public-links", "El edificio no está disponible.", "danger");
  const hours = parsePublicLinkHours(req.body.hours);
  if (hours === null) {
    const data = await publicLinkSettingsData();
    const selectedBuilding = data.buildings.find((item) => Number(item.id) === Number(building.id));
    if (selectedBuilding) selectedBuilding.public_link_ttl_hours = req.body.hours;
    return res.status(400).render("admin/public-links", {
      ...data,
      errors: [`Ingresa un número entero de horas entre 1 y ${MAX_PUBLIC_LINK_TTL_HOURS}.`]
    });
  }
  await buildingRepository.updatePublicLinkTtlHours(building.id, hours, req.currentUser.id);
  redirectWith(res, "/admin/public-links", `Duración de enlaces para ${building.name} actualizada correctamente.`);
});

router.get("/logs", async (req, res) => {
  const pageSize = 50;
  const page = Math.max(Number(req.query.page) || 1, 1);
  const filters = {
    email: cleanText(req.query.email, 160),
    method: ["POST", "PUT", "PATCH", "DELETE"].includes(req.query.method) ? req.query.method : "",
    statusCode: Number.isInteger(Number(req.query.status_code)) ? Number(req.query.status_code) : 0,
    path: cleanText(req.query.path, 200),
    limit: pageSize,
    offset: (page - 1) * pageSize
  };
  const totalLogs = await countApiLogs(filters);
  const totalPages = Math.max(Math.ceil(totalLogs / pageSize), 1);
  res.render("admin/logs", {
    filters,
    logs: await listApiLogs(filters),
    summary: await apiLogSummary(),
    page,
    pageSize,
    totalLogs,
    totalPages
  });
});

module.exports = router;
