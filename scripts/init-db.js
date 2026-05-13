const { initDb } = require("../src/db");

initDb().then(() => {
  console.log("Base de datos inicializada.");
});
