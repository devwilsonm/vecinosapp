const express = require("express");
const { db } = require("../db");
const { clearSession, setSession, verifyPassword } = require("../utils/auth");

const router = express.Router();

router.get("/login", (req, res) => {
  if (req.currentUser) return res.redirect("/");
  res.render("auth/login", { errors: [] });
});

router.post("/login", (req, res) => {
  const email = String(req.body.email || "").trim().toLowerCase();
  const password = String(req.body.password || "");
  const user = db.prepare("SELECT * FROM users WHERE email = ? AND is_active = 1").get(email);
  if (!user || !verifyPassword(password, user.password_hash)) {
    return res.status(401).render("auth/login", { errors: ["Correo o contraseña incorrectos."] });
  }
  req.currentUser = { id: user.id, full_name: user.full_name, email: user.email };
  setSession(res, user.id);
  res.redirect("/");
});

router.post("/logout", (req, res) => {
  clearSession(res);
  res.redirect("/login");
});

module.exports = router;
