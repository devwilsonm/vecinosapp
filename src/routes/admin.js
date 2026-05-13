const express = require("express");
const { db } = require("../db");
const { hashPassword } = require("../utils/auth");
const { requireSuperAdmin } = require("../utils/access");
const { cleanText } = require("../utils/validation");
const { apiLogSummary, countApiLogs, listApiLogs } = require("../logDb");

const router = express.Router();

router.use(requireSuperAdmin);

function redirectWith(res, url, message, type = "success") {
  res.redirect(`${url}?message=${encodeURIComponent(message)}&type=${type}`);
}

function selectedIds(value) {
  if (!value) return [];
  return (Array.isArray(value) ? value : [value]).map(Number).filter((id) => Number.isInteger(id) && id > 0);
}

function roleOptions() {
  return db.prepare("SELECT * FROM roles WHERE is_active = 1 ORDER BY is_system DESC, name").all();
}

function buildingOptions() {
  return db.prepare("SELECT * FROM buildings WHERE is_active = 1 ORDER BY name").all();
}

function permissionsByModule() {
  return db.prepare("SELECT * FROM permissions ORDER BY module, name").all().reduce((groups, permission) => {
    if (!groups[permission.module]) groups[permission.module] = [];
    groups[permission.module].push(permission);
    return groups;
  }, {});
}

router.get("/", (req, res) => {
  const counts = {
    users: db.prepare("SELECT COUNT(*) AS total FROM users").get().total,
    roles: db.prepare("SELECT COUNT(*) AS total FROM roles").get().total,
    permissions: db.prepare("SELECT COUNT(*) AS total FROM permissions").get().total
  };
  res.render("admin/index", { counts });
});

router.get("/users", (req, res) => {
  const users = db.prepare(`
    SELECT u.*, r.name AS role_name, r.key AS role_key,
      COUNT(ub.building_id) AS building_count
    FROM users u
    LEFT JOIN roles r ON u.role_id = r.id
    LEFT JOIN user_buildings ub ON u.id = ub.user_id
    GROUP BY u.id
    ORDER BY u.is_active DESC, u.full_name
  `).all();
  res.render("admin/users/index", { users });
});

router.get("/users/new", (req, res) => {
  res.render("admin/users/form", {
    title: "Nuevo usuario",
    user: { is_active: 1 },
    roles: roleOptions(),
    buildings: buildingOptions(),
    assignedBuildings: [],
    errors: []
  });
});

router.post("/users", (req, res) => {
  const errors = [];
  const email = cleanText(req.body.email, 160).toLowerCase();
  const role = db.prepare("SELECT * FROM roles WHERE id = ? AND is_active = 1").get(Number(req.body.role_id));
  if (!cleanText(req.body.full_name, 160)) errors.push("El nombre completo es obligatorio.");
  if (!email || !email.includes("@")) errors.push("El correo electrónico es obligatorio y debe ser válido.");
  if (!role) errors.push("Selecciona un perfil activo.");
  if (!String(req.body.password || "").trim() || String(req.body.password).length < 6) errors.push("La contraseña debe tener al menos 6 caracteres.");
  const duplicate = db.prepare("SELECT id FROM users WHERE email = ?").get(email);
  if (duplicate) errors.push("Ya existe un usuario con ese correo.");

  const assignedBuildings = selectedIds(req.body.building_ids);
  if (errors.length) {
    return res.status(400).render("admin/users/form", {
      title: "Nuevo usuario",
      user: req.body,
      roles: roleOptions(),
      buildings: buildingOptions(),
      assignedBuildings,
      errors
    });
  }

  const save = db.transaction(() => {
    const userId = db.prepare(`
      INSERT INTO users (role_id, full_name, email, password_hash, is_active, created_by, updated_by)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      Number(req.body.role_id),
      cleanText(req.body.full_name, 160),
      email,
      hashPassword(req.body.password),
      req.body.is_active ? 1 : 0,
      req.currentUser.id,
      req.currentUser.id
    ).lastInsertRowid;

    const insertBuilding = db.prepare("INSERT INTO user_buildings (user_id, building_id) VALUES (?, ?)");
    assignedBuildings.forEach((buildingId) => insertBuilding.run(userId, buildingId));
  });
  save();
  redirectWith(res, "/admin/users", "Usuario creado correctamente.");
});

router.get("/users/:id/edit", (req, res) => {
  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(req.params.id);
  if (!user) return res.status(404).render("error", { title: "No encontrado", message: "Usuario no encontrado." });
  const assignedBuildings = db.prepare("SELECT building_id FROM user_buildings WHERE user_id = ?").all(user.id).map((row) => row.building_id);
  res.render("admin/users/form", {
    title: "Editar usuario",
    user,
    roles: roleOptions(),
    buildings: buildingOptions(),
    assignedBuildings,
    errors: []
  });
});

router.put("/users/:id", (req, res) => {
  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(req.params.id);
  if (!user) return res.status(404).render("error", { title: "No encontrado", message: "Usuario no encontrado." });

  const errors = [];
  const email = cleanText(req.body.email, 160).toLowerCase();
  const role = db.prepare("SELECT * FROM roles WHERE id = ? AND is_active = 1").get(Number(req.body.role_id));
  if (!cleanText(req.body.full_name, 160)) errors.push("El nombre completo es obligatorio.");
  if (!email || !email.includes("@")) errors.push("El correo electrónico es obligatorio y debe ser válido.");
  if (!role) errors.push("Selecciona un perfil activo.");
  if (req.body.password && String(req.body.password).length < 6) errors.push("La contraseña debe tener al menos 6 caracteres.");
  if (Number(req.params.id) === Number(req.currentUser.id) && (role?.key !== "super_admin" || !req.body.is_active)) {
    errors.push("No puedes quitarte tu propio acceso de Super Admin.");
  }
  const duplicate = db.prepare("SELECT id FROM users WHERE email = ? AND id != ?").get(email, req.params.id);
  if (duplicate) errors.push("Ya existe otro usuario con ese correo.");

  const assignedBuildings = selectedIds(req.body.building_ids);
  if (errors.length) {
    return res.status(400).render("admin/users/form", {
      title: "Editar usuario",
      user: { ...req.body, id: req.params.id },
      roles: roleOptions(),
      buildings: buildingOptions(),
      assignedBuildings,
      errors
    });
  }

  const save = db.transaction(() => {
    if (req.body.password) {
      db.prepare(`
        UPDATE users
        SET role_id = ?, full_name = ?, email = ?, password_hash = ?, is_active = ?, updated_by = ?
        WHERE id = ?
      `).run(Number(req.body.role_id), cleanText(req.body.full_name, 160), email, hashPassword(req.body.password), req.body.is_active ? 1 : 0, req.currentUser.id, req.params.id);
    } else {
      db.prepare(`
        UPDATE users
        SET role_id = ?, full_name = ?, email = ?, is_active = ?, updated_by = ?
        WHERE id = ?
      `).run(Number(req.body.role_id), cleanText(req.body.full_name, 160), email, req.body.is_active ? 1 : 0, req.currentUser.id, req.params.id);
    }
    db.prepare("DELETE FROM user_buildings WHERE user_id = ?").run(req.params.id);
    const insertBuilding = db.prepare("INSERT INTO user_buildings (user_id, building_id) VALUES (?, ?)");
    assignedBuildings.forEach((buildingId) => insertBuilding.run(req.params.id, buildingId));
  });
  save();
  redirectWith(res, "/admin/users", "Usuario actualizado correctamente.");
});

router.post("/users/:id/deactivate", (req, res) => {
  if (Number(req.params.id) === Number(req.currentUser.id)) {
    return redirectWith(res, "/admin/users", "No puedes desactivar tu propio usuario.", "danger");
  }
  db.prepare("UPDATE users SET is_active = 0, updated_by = ? WHERE id = ?").run(req.currentUser.id, req.params.id);
  redirectWith(res, "/admin/users", "Usuario desactivado.");
});

router.get("/roles", (req, res) => {
  const roles = db.prepare(`
    SELECT r.*, COUNT(rp.permission_id) AS permission_count
    FROM roles r
    LEFT JOIN role_permissions rp ON r.id = rp.role_id
    GROUP BY r.id
    ORDER BY r.is_system DESC, r.name
  `).all();
  res.render("admin/roles/index", { roles });
});

router.get("/roles/new", (req, res) => {
  res.render("admin/roles/form", {
    title: "Nuevo perfil",
    role: { is_active: 1 },
    permissionsByModule: permissionsByModule(),
    selectedPermissions: [],
    errors: []
  });
});

router.post("/roles", (req, res) => {
  const errors = [];
  const key = cleanText(req.body.key, 80).toLowerCase().replace(/[^a-z0-9_.-]/g, "_");
  if (!cleanText(req.body.name, 120)) errors.push("El nombre del perfil es obligatorio.");
  if (!key) errors.push("La clave del perfil es obligatoria.");
  if (db.prepare("SELECT id FROM roles WHERE key = ?").get(key)) errors.push("Ya existe un perfil con esa clave.");
  const selectedPermissions = selectedIds(req.body.permission_ids);

  if (errors.length) {
    return res.status(400).render("admin/roles/form", {
      title: "Nuevo perfil",
      role: { ...req.body, key },
      permissionsByModule: permissionsByModule(),
      selectedPermissions,
      errors
    });
  }

  const save = db.transaction(() => {
    const roleId = db.prepare(`
      INSERT INTO roles (name, key, description, is_system, is_active, created_by, updated_by)
      VALUES (?, ?, ?, 0, ?, ?, ?)
    `).run(cleanText(req.body.name, 120), key, cleanText(req.body.description, 500), req.body.is_active ? 1 : 0, req.currentUser.id, req.currentUser.id).lastInsertRowid;
    const insertPermission = db.prepare("INSERT INTO role_permissions (role_id, permission_id) VALUES (?, ?)");
    selectedPermissions.forEach((permissionId) => insertPermission.run(roleId, permissionId));
  });
  save();
  redirectWith(res, "/admin/roles", "Perfil creado correctamente.");
});

router.get("/roles/:id/edit", (req, res) => {
  const role = db.prepare("SELECT * FROM roles WHERE id = ?").get(req.params.id);
  if (!role) return res.status(404).render("error", { title: "No encontrado", message: "Perfil no encontrado." });
  const selectedPermissions = db.prepare("SELECT permission_id FROM role_permissions WHERE role_id = ?").all(role.id).map((row) => row.permission_id);
  res.render("admin/roles/form", {
    title: "Editar perfil",
    role,
    permissionsByModule: permissionsByModule(),
    selectedPermissions,
    errors: []
  });
});

router.put("/roles/:id", (req, res) => {
  const role = db.prepare("SELECT * FROM roles WHERE id = ?").get(req.params.id);
  if (!role) return res.status(404).render("error", { title: "No encontrado", message: "Perfil no encontrado." });
  const errors = [];
  if (!cleanText(req.body.name, 120)) errors.push("El nombre del perfil es obligatorio.");
  if (role.key === "super_admin" && !req.body.is_active) errors.push("El perfil Super Admin no puede desactivarse.");
  const selectedPermissions = selectedIds(req.body.permission_ids);

  if (errors.length) {
    return res.status(400).render("admin/roles/form", {
      title: "Editar perfil",
      role: { ...req.body, id: req.params.id, key: role.key, is_system: role.is_system },
      permissionsByModule: permissionsByModule(),
      selectedPermissions,
      errors
    });
  }

  const save = db.transaction(() => {
    db.prepare(`
      UPDATE roles
      SET name = ?, description = ?, is_active = ?, updated_by = ?
      WHERE id = ?
    `).run(cleanText(req.body.name, 120), cleanText(req.body.description, 500), req.body.is_active ? 1 : 0, req.currentUser.id, req.params.id);
    db.prepare("DELETE FROM role_permissions WHERE role_id = ?").run(req.params.id);
    const insertPermission = db.prepare("INSERT INTO role_permissions (role_id, permission_id) VALUES (?, ?)");
    selectedPermissions.forEach((permissionId) => insertPermission.run(req.params.id, permissionId));
  });
  save();
  redirectWith(res, "/admin/roles", "Perfil actualizado correctamente.");
});

router.get("/permissions", (req, res) => {
  res.render("admin/permissions/index", { permissionsByModule: permissionsByModule() });
});

router.get("/maintenance", (req, res) => {
  const logs = db.prepare(`
    SELECT u.email, COUNT(*) AS total
    FROM users u
    GROUP BY u.id
    ORDER BY u.email
  `).all();
  res.render("admin/maintenance", { logs });
});

router.get("/logs", (req, res) => {
  const pageSize = 50;
  const page = Math.max(Number(req.query.page) || 1, 1);
  const filters = {
    email: cleanText(req.query.email, 160),
    method: ["GET", "POST", "PUT", "DELETE"].includes(req.query.method) ? req.query.method : "",
    statusCode: Number.isInteger(Number(req.query.status_code)) ? Number(req.query.status_code) : 0,
    path: cleanText(req.query.path, 200),
    limit: pageSize,
    offset: (page - 1) * pageSize
  };
  const totalLogs = countApiLogs(filters);
  const totalPages = Math.max(Math.ceil(totalLogs / pageSize), 1);
  res.render("admin/logs", {
    filters,
    logs: listApiLogs(filters),
    summary: apiLogSummary(),
    page,
    pageSize,
    totalLogs,
    totalPages
  });
});

module.exports = router;
