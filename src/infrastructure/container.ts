const { db } = require("../db");
const { SqlBuildingRepository } = require("./repositories/sqlBuildingRepository");

const buildingRepository = new SqlBuildingRepository(db);

module.exports = { buildingRepository };
