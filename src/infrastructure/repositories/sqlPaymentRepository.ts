import type { DatabasePort } from "../../domain/ports/database";
import type { PaymentInput, PaymentRepository } from "../../domain/payments/paymentRepository";

export class SqlPaymentRepository implements PaymentRepository {
  constructor(private readonly database: DatabasePort) {}

  listPendingByBuilding(buildingId: number) {
    return this.database.prepare(`
      SELECT a.*, o.full_name, o.floor, o.unit, r.receipt_number, r.period, b.name AS building_name
      FROM receipt_allocations a
      JOIN occupants o ON a.occupant_id = o.id
      JOIN receipts r ON a.receipt_id = r.id
      JOIN buildings b ON r.building_id = b.id
      WHERE a.balance_cents > 0 AND r.building_id = ?
      ORDER BY CAST(o.floor AS INTEGER), o.floor, o.unit, o.full_name, r.due_date
    `).all(buildingId);
  }

  listByBuilding(buildingId: number) {
    return this.database.prepare(`
      SELECT p.*, o.full_name, o.floor, o.unit, r.receipt_number, r.period, b.name AS building_name
      FROM payments p
      JOIN receipt_allocations a ON p.allocation_id = a.id
      JOIN occupants o ON a.occupant_id = o.id
      JOIN receipts r ON a.receipt_id = r.id
      JOIN buildings b ON r.building_id = b.id
      WHERE r.building_id = ?
      ORDER BY p.payment_date DESC, p.id DESC
    `).all(buildingId);
  }

  findAllocation(id: number | string) {
    return this.database.prepare(`
      SELECT a.*, o.full_name, r.receipt_number, r.period, r.id AS receipt_id, r.building_id
      FROM receipt_allocations a
      JOIN occupants o ON a.occupant_id = o.id
      JOIN receipts r ON a.receipt_id = r.id
      WHERE a.id = ?
    `).get(id);
  }

  async create(input: PaymentInput, actorId: number) {
    const result = await this.database.prepare(`
      INSERT INTO payments (allocation_id, amount_cents, payment_date, payment_method, note, created_by)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(input.allocation_id, input.amount_cents, input.payment_date, input.payment_method, input.note, actorId);
    return result.lastInsertRowid;
  }

  async markAllocationUpdated(id: number | string, actorId: number) {
    await this.database.prepare("UPDATE receipt_allocations SET updated_by = ? WHERE id = ?").run(actorId, id);
  }

  async markReceiptUpdated(id: number | string, actorId: number) {
    await this.database.prepare("UPDATE receipts SET updated_by = ? WHERE id = ?").run(actorId, id);
  }
}

module.exports = { SqlPaymentRepository };
