import type { DatabasePort } from "../../domain/ports/database";
import type { DashboardRepository } from "../../domain/dashboard/dashboardRepository";

export class SqlDashboardRepository implements DashboardRepository {
  constructor(private readonly database: DatabasePort) {}

  private count(sql: string, buildingId: number) {
    return this.database.prepare(sql).get(buildingId).then((row) => Number(row?.total || 0));
  }

  countOccupants(buildingId: number) {
    return this.count("SELECT COUNT(*) AS total FROM occupants WHERE building_id = ?", buildingId);
  }

  countReceipts(buildingId: number) {
    return this.count("SELECT COUNT(*) AS total FROM receipts WHERE building_id = ?", buildingId);
  }

  countPendingReceipts(buildingId: number) {
    return this.count("SELECT COUNT(*) AS total FROM receipts WHERE building_id = ? AND status != 'pagado'", buildingId);
  }

  recentPayments(buildingId: number) {
    return this.database.prepare(`
      SELECT p.*, o.full_name, r.receipt_number
      FROM payments p
      JOIN receipt_allocations a ON p.allocation_id = a.id
      JOIN occupants o ON a.occupant_id = o.id
      JOIN receipts r ON a.receipt_id = r.id
      WHERE r.building_id = ?
      ORDER BY p.payment_date DESC, p.id DESC
      LIMIT 5
    `).all(buildingId);
  }

  debts(buildingId: number) {
    return this.database.prepare(`
      SELECT o.id, o.full_name, o.floor, o.unit,
        SUM(a.assigned_amount_cents) AS assigned_cents,
        SUM(a.paid_amount_cents) AS paid_cents,
        SUM(a.balance_cents) AS balance_cents
      FROM occupants o
      JOIN receipt_allocations a ON o.id = a.occupant_id
      JOIN receipts r ON a.receipt_id = r.id
      WHERE a.balance_cents > 0 AND r.building_id = ?
      GROUP BY o.id
      ORDER BY CAST(o.floor AS INTEGER), o.floor, o.unit, o.full_name
    `).all(buildingId);
  }
}

module.exports = { SqlDashboardRepository };