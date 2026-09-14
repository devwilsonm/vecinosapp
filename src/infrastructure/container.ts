const { db } = require("./database/database");
const { SqlBuildingRepository } = require("./repositories/sqlBuildingRepository");
const { SqlOccupantRepository } = require("./repositories/sqlOccupantRepository");
const { SqlReceiptRepository } = require("./repositories/sqlReceiptRepository");
const { SqlPaymentRepository } = require("./repositories/sqlPaymentRepository");
const { SqlPublicAllocationRepository } = require("./repositories/sqlPublicAllocationRepository");
const { SqlPublicReportRepository } = require("./repositories/sqlPublicReportRepository");
const { SqlPublicLinkSettingsRepository } = require("./repositories/sqlPublicLinkSettingsRepository");
const { SqlDashboardRepository } = require("./repositories/sqlDashboardRepository");
const { SqlReportRepository } = require("./repositories/sqlReportRepository");
const { SqlUserRepository } = require("./repositories/sqlUserRepository");
const { SqlRoleRepository } = require("./repositories/sqlRoleRepository");
const { SqlAllocationRepository } = require("./repositories/sqlAllocationRepository");

const buildingRepository = new SqlBuildingRepository(db);
const occupantRepository = new SqlOccupantRepository(db);
const receiptRepository = new SqlReceiptRepository(db);
const paymentRepository = new SqlPaymentRepository(db);
const publicAllocationRepository = new SqlPublicAllocationRepository(db);
const publicReportRepository = new SqlPublicReportRepository(db);
const publicLinkSettingsRepository = new SqlPublicLinkSettingsRepository(db);
const dashboardRepository = new SqlDashboardRepository(db);
const reportRepository = new SqlReportRepository(db);
const userRepository = new SqlUserRepository(db);
const roleRepository = new SqlRoleRepository(db);
const allocationRepository = new SqlAllocationRepository(db);

module.exports = { allocationRepository, buildingRepository, dashboardRepository, occupantRepository, paymentRepository, publicAllocationRepository, publicReportRepository, publicLinkSettingsRepository, receiptRepository, reportRepository, roleRepository, userRepository };
