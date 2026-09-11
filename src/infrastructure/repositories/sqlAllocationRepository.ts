import type { DatabasePort } from "../../domain/ports/database";
import type { AllocationData, AllocationRepository } from "../../domain/allocations/allocationRepository";

export class SqlAllocationRepository implements AllocationRepository {
  constructor(private readonly database: DatabasePort) {}

  listReceipts(canAccessAll: boolean, buildingIds: number[]) {
    if (!canAccessAll && !buildingIds.length) return Promise.resolve([]);
    const filter = canAccessAll ? "" : ` WHERE r.building_id IN (${buildingIds.map(() => "?").join(",")})`;
    const params = canAccessAll ? [] : buildingIds;
    return this.database.prepare(`
      SELECT r.*, b.name AS building_name, COUNT(a.id) AS allocation_count
      FROM receipts r
      LEFT JOIN buildings b ON r.building_id = b.id
      LEFT JOIN receipt_allocations a ON r.id = a.receipt_id
      ${filter}
      GROUP BY r.id, b.name
      ORDER BY r.created_at DESC
    `).all(...params);
  }

  findReceipt(id: number | string) {
    return this.database.prepare(`
      SELECT r.*, b.name AS building_name
      FROM receipts r
      LEFT JOIN buildings b ON r.building_id = b.id
      WHERE r.id = ?
    `).get(id);
  }

  listFormOccupants(buildingId: number, occupantIds?: number[]) {
    const filter = occupantIds?.length ? ` AND id IN (${occupantIds.map(() => "?").join(",")})` : "";
    const params = occupantIds?.length ? [buildingId, ...occupantIds] : [buildingId];
    return this.database.prepare(`
      SELECT id, full_name, floor, unit
      FROM occupants
      WHERE is_active = 1 AND building_id = ?${filter}
      ORDER BY CAST(floor AS INTEGER), floor, unit, full_name
    `).all(...params);
  }

  listByReceipt(id: number | string) {
    return this.database.prepare("SELECT * FROM receipt_allocations WHERE receipt_id = ?").all(id);
  }

  async countByReceipt(id: number | string) {
    const result = await this.database.prepare("SELECT COUNT(*) AS total FROM receipt_allocations WHERE receipt_id = ?").get(id);
    return Number(result?.total || 0);
  }

  async countPaymentsByReceipt(id: number | string) {
    const result = await this.database.prepare(`
      SELECT COUNT(*) AS total
      FROM payments p
      JOIN receipt_allocations a ON p.allocation_id = a.id
      WHERE a.receipt_id = ?
    `).get(id);
    return Number(result?.total || 0);
  }

  async replace(receiptId: number | string, allocations: AllocationData[], actorId: number) {
    const save = this.database.transaction(async () => {
      await this.database.prepare("DELETE FROM receipt_allocations WHERE receipt_id = ?").run(receiptId);
      const insert = this.database.prepare(`
        INSERT INTO receipt_allocations (receipt_id, occupant_id, assigned_amount_cents, consumption_milli, paid_amount_cents, balance_cents, status, created_by, updated_by)
        VALUES (?, ?, ?, ?, 0, ?, 'pendiente', ?, ?)
      `);
      for (const allocation of allocations) {
        await insert.run(receiptId, allocation.occupant_id, allocation.assigned_amount_cents, allocation.consumption_milli, allocation.assigned_amount_cents, actorId, actorId);
      }
      await this.updateReceiptStatus(receiptId);
      await this.markReceiptUpdated(receiptId, actorId);
    });
    await save();
  }

  async markReceiptUpdated(receiptId: number | string, actorId: number) {
    await this.database.prepare("UPDATE receipts SET updated_by = ? WHERE id = ?").run(actorId, receiptId);
  }

  async updateAllocationStatus(allocationId: number | string) {
    const paid = await this.database.prepare("SELECT COALESCE(SUM(amount_cents), 0) AS total FROM payments WHERE allocation_id = ?").get(allocationId);
    const allocation = await this.database.prepare("SELECT assigned_amount_cents FROM receipt_allocations WHERE id = ?").get(allocationId);
    const totalPaid = Number(paid?.total || 0);
    const balance = Math.max(0, Number(allocation?.assigned_amount_cents || 0) - totalPaid);
    const status = balance === 0 ? "pagado" : totalPaid > 0 ? "pagado parcial" : "pendiente";
    await this.database.prepare("UPDATE receipt_allocations SET paid_amount_cents = ?, balance_cents = ?, status = ? WHERE id = ?").run(totalPaid, balance, status, allocationId);
  }

  async updateReceiptStatus(receiptId: number | string) {
    const allocations = await this.database.prepare("SELECT paid_amount_cents, balance_cents FROM receipt_allocations WHERE receipt_id = ?").all(receiptId);
    let status = "pendiente";
    if (allocations.length > 0) {
      const allPaid = allocations.every((allocation) => Number(allocation.balance_cents) === 0);
      const anyPaid = allocations.some((allocation) => Number(allocation.paid_amount_cents) > 0);
      status = allPaid ? "pagado" : anyPaid ? "pagado parcialmente" : "prorrateado";
    }
    await this.database.prepare("UPDATE receipts SET status = ? WHERE id = ?").run(status, receiptId);
  }
}

module.exports = { SqlAllocationRepository };
