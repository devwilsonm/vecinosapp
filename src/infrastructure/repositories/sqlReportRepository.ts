import type { DatabasePort } from "../../domain/ports/database";
import type { ReportRepository } from "../../domain/reports/reportRepository";

export class SqlReportRepository implements ReportRepository {
  constructor(private readonly database: DatabasePort) {}

  private access(canAccessAll: boolean, buildingIds: number[], column: string) {
    if (canAccessAll) return { sql: "", params: [] };
    if (!buildingIds.length) return { sql: ` AND 1 = 0`, params: [] };
    return { sql: ` AND ${column} IN (${buildingIds.map(() => "?").join(",")})`, params: buildingIds };
  }

  debtsByOccupant(canAccessAll: boolean, buildingIds: number[]) {
    const access = this.access(canAccessAll, buildingIds, "r.building_id");
    return this.database.prepare(`
      SELECT o.full_name, o.floor, o.unit, SUM(a.balance_cents) AS balance_cents
      FROM occupants o
      JOIN receipt_allocations a ON o.id = a.occupant_id
      JOIN receipts r ON a.receipt_id = r.id
      WHERE a.balance_cents > 0${access.sql}
      GROUP BY o.id
      ORDER BY CAST(o.floor AS INTEGER), o.floor, o.unit, o.full_name
    `).all(...access.params);
  }

  pendingReceipts(canAccessAll: boolean, buildingIds: number[]) {
    const access = this.access(canAccessAll, buildingIds, "r.building_id");
    return this.database.prepare(`SELECT * FROM receipts r WHERE status != 'pagado'${access.sql} ORDER BY due_date`).all(...access.params);
  }

  paymentsByPeriod(canAccessAll: boolean, buildingIds: number[]) {
    const access = this.access(canAccessAll, buildingIds, "r.building_id");
    return this.database.prepare(`
      SELECT r.period, SUM(p.amount_cents) AS total_cents
      FROM payments p
      JOIN receipt_allocations a ON p.allocation_id = a.id
      JOIN receipts r ON a.receipt_id = r.id
      WHERE 1 = 1${access.sql}
      GROUP BY r.period
      ORDER BY r.period
    `).all(...access.params);
  }

  receiptTotals(canAccessAll: boolean, buildingIds: number[]) {
    const access = this.access(canAccessAll, buildingIds, "r.building_id");
    return this.database.prepare(`
      SELECT r.*, COALESCE(SUM(a.paid_amount_cents), 0) AS collected_cents,
        COALESCE(SUM(a.balance_cents), 0) AS balance_cents
      FROM receipts r
      LEFT JOIN receipt_allocations a ON r.id = a.receipt_id
      WHERE 1 = 1${access.sql}
      GROUP BY r.id
      ORDER BY r.created_at DESC
    `).all(...access.params);
  }

  consumptionByMonth(canAccessAll: boolean, buildingIds: number[], filters: Record<string, any>) {
    const access = this.access(canAccessAll, buildingIds, "r.building_id");
    const params = [filters.from, filters.to];
    const serviceFilter = filters.serviceType ? " AND r.service_type = ?" : "";
    const buildingFilter = filters.buildingId ? " AND r.building_id = ?" : "";
    if (filters.serviceType) params.push(filters.serviceType);
    if (filters.buildingId) params.push(filters.buildingId);
    params.push(...access.params);
    return this.database.prepare(`
      SELECT r.service_type, MAX(r.consumption_unit) AS consumption_unit,
        SUBSTR(r.issue_date, 1, 7) AS month,
        SUM(r.consumption_total_milli) AS consumption_milli
      FROM receipts r
      WHERE r.issue_date >= ? AND r.issue_date < ?${serviceFilter}${buildingFilter}${access.sql}
      GROUP BY r.service_type, SUBSTR(r.issue_date, 1, 7)
      ORDER BY month, r.service_type
    `).all(...params);
  }
}

module.exports = { SqlReportRepository };