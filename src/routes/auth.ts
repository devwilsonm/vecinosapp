const express = require("express");
const { clearSession, setSession, verifyPassword } = require("../utils/auth");
const { invalidatePageCache } = require("../utils/cache");
const { userRepository } = require("../infrastructure/container");

const router = express.Router();

router.get("/login", (req, res) => {
  if (req.currentUser) return res.redirect("/");
  res.render("auth/login", { errors: [] });
});

router.post("/login", async (req, res) => {
  const email = String(req.body.email || "").trim().toLowerCase();
  const password = String(req.body.password || "");
  req.auditUserEmail = email;
  const user = await userRepository.findActiveByEmail(email);
  if (!user || !verifyPassword(password, user.password_hash)) {
    req.auditMessage = "Intento de login fallido.";
    return res.status(401).render("auth/login", { errors: ["Correo o contraseña incorrectos."] });
  }
  req.currentUser = { id: user.id, full_name: user.full_name, email: user.email };
  req.auditMessage = "Inicio de sesión correcto.";
  setSession(res, user.id);
  res.redirect("/");
});

router.post("/theme", async (req, res) => {
  if (!req.currentUser) return res.status(401).json({ error: "Sesión no válida." });
  if (!["light", "dark"].includes(req.body.theme)) return res.status(400).json({ error: "Tema no válido." });
  await userRepository.updateTheme(req.currentUser.id, req.body.theme);
  invalidatePageCache();
  res.json({ theme: req.body.theme });
});

router.post("/logout", (req, res) => {
  req.auditMessage = "Cierre de sesión.";
  clearSession(res);
  res.redirect("/login");
});

module.exports = router;