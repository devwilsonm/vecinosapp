const path = require("path");

const rootDir = path.join(__dirname, "..");
const dataDir = path.basename(rootDir) === "dist" ? path.join(rootDir, "..") : rootDir;

module.exports = {
  port: process.env.PORT || 3000,
  databasePath: process.env.DATABASE_PATH || path.join(dataDir, "instance", "vecinosapp.sqlite"),
  dataDir,
  rootDir
};
