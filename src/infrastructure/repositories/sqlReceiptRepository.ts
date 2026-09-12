import type { DatabasePort } from "../../domain/ports/database";

export class SqlReceiptRepository {
  constructor(private readonly database: DatabasePort) {}

  listAccessible(canAccessAll: boolean, buildingIds: number[]) {
    if (!canAccessAll && !buildingIds.length) return Promise.resolve([]);
    const filter = canAccessAll ? "" : ` WHERE r.building_id IN (${buildingIds.map(() => "?").join(",")})`;
    const params = canAccessAll ? [] : buildingIds;
    return this.database.prepare(`
      SELECT r.*, b.name AS building_name
      FROM receipts r
      LEFT JOIN buildings b ON r.building_id = b.id
      ${filter}
      ORDER BY r.due_date DESC, r.id DESC
    `).all(...params);
  }

  findById(id: number | string) {
    return this.database.prepare(`
      SELECT r.*, b.name AS building_name
      FROM receipts r
      LEFT JOIN buildings b ON r.building_id = b.id
      WHERE r.id = ?
    `).get(id);
  }

  findRawById(id: number | string) {
    return this.database.prepare("SELECT * FROM receipts WHERE id = ?").get(id);
  }

  findBuildingId(id: number | string) {
    return this.database.prepare("SELECT building_id FROM receipts WHERE id = ?").get(id);
  }

  findBuildingForValidation(id: number) {
    return this.database.prepare("SELECT id FROM buildings WHERE id = ? AND is_active = 1").get(id);
  }

  findDuplicateNumber(receiptNumber: string, excludedId: number) {
    return this.database.prepare("SELECT id FROM receipts WHERE receipt_number = ? AND id != ?").get(receiptNumber, excludedId);
  }

  countAllocations(id: number | string) {
    return this.database.prepare("SELECT COUNT(*) AS total FROM receipt_allocations WHERE receipt_id = ?").get(id);
  }

  listAllocations(id: number | string) {
    return this.database.prepare(`
      SELECT a.*, o.full_name, o.floor, o.unit
      FROM receipt_allocations a
      JOIN occupants o ON a.occupant_id = o.id
      WHERE a.receipt_id = ?
      ORDER BY CAST(o.floor AS INTEGER), o.floor, o.unit, o.full_name
    `).all(id);
  }

  countPayments(id: number | string) {
    return this.database.prepare(`
      SELECT COUNT(*) AS total
      FROM payments p
      JOIN receipt_allocations a ON p.allocation_id = a.id
      WHERE a.receipt_id = ?
    `).get(id);
  }

  async create(input: Record<string, any>, actorId: number) {
    const result = await this.database.prepare(`
      INSERT INTO receipts (building_id, service_type, receipt_number, period, issue_date, due_date, total_amount_cents, consumption_total_milli, consumption_unit, description, file_reference, created_by, updated_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(input.building_id, input.service_type, input.receipt_number, input.period, input.issue_date, input.due_date, input.total_amount_cents, input.consumption_total_milli, input.consumption_unit, input.description, input.file_reference, actorId, actorId);
    return result.lastInsertRowid;
  }

  async update(id: number | string, input: Record<string, any>, actorId: number) {
    await this.database.prepare(`
      UPDATE receipts
      SET building_id = ?, service_type = ?, receipt_number = ?, period = ?, issue_date = ?, due_date = ?, total_amount_cents = ?, consumption_total_milli = ?, consumption_unit = ?, description = ?, file_reference = ?, updated_by = ?
      WHERE id = ?
    `).run(input.building_id, input.service_type, input.receipt_number, input.period, input.issue_date, input.due_date, input.total_amount_cents, input.consumption_total_milli, input.consumption_unit, input.description, input.file_reference, actorId, id);
  }

  async remove(id: number | string) {
    await this.database.prepare("DELETE FROM receipts WHERE id = ?").run(id);
  }
}

module.exports = { SqlReceiptRepository };