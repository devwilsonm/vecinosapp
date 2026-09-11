const { initDb } = require("../src/infrastructure/database/database");

initDb().then(() => {
  console.log("Base de datos inicializada.");
});
