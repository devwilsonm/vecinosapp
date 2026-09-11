import type { DatabasePort } from "../../domain/ports/database";
import type { OccupantInput, OccupantRepository } from "../../domain/occupants/occupantRepository";

export class SqlOccupantRepository implements OccupantRepository {
  constructor(private readonly database: DatabasePort) {}

  listAccessible(canAccessAll: boolean, buildingIds: number[]) {
    if (!canAccessAll && !buildingIds.length) return Promise.resolve([]);
    const filter = canAccessAll ? "" : ` WHERE o.building_id IN (${buildingIds.map(() => "?").join(",")})`;
    const params = canAccessAll ? [] : buildingIds;
    return this.database.prepare(`
      SELECT o.*, b.name AS building_name
      FROM occupants o
      LEFT JOIN buildings b ON o.building_id = b.id
      ${filter}
      ORDER BY o.is_active DESC, b.name, CAST(o.floor AS INTEGER), o.floor, o.unit, o.full_name
    `).all(...params);
  }

  findById(id: number | string) {
    return this.database.prepare("SELECT * FROM occupants WHERE id = ?").get(id);
  }

  findWithBuilding(id: number | string) {
    return this.database.prepare(`
      SELECT o.*, b.name AS building_name
      FROM occupants o
      LEFT JOIN buildings b ON o.building_id = b.id
      WHERE o.id = ?
    `).get(id);
  }

  findBuildingForValidation(id: number) {
    return this.database.prepare("SELECT id, floors FROM buildings WHERE id = ? AND is_active = 1").get(id);
  }

  findDuplicateDocument(document: string, excludedId: number) {
    return this.database.prepare("SELECT id FROM occupants WHERE document = ? AND id != ?").get(document, excludedId);
  }

  listAllocations(id: number | string) {
    return this.database.prepare(`
      SELECT a.*, r.receipt_number, r.period
      FROM receipt_allocations a
      JOIN receipts r ON a.receipt_id = r.id
      WHERE a.occupant_id = ?
      ORDER BY r.due_date DESC
    `).all(id);
  }

  async create(input: OccupantInput, actorId: number) {
    const result = await this.database.prepare(`
      INSERT INTO occupants (building_id, full_name, document, phone, email, floor, unit, is_active, created_by, updated_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(input.building_id, input.full_name, input.document, input.phone, input.email, input.floor, input.unit, input.is_active, actorId, actorId);
    return result.lastInsertRowid;
  }

  async update(id: number | string, input: OccupantInput, actorId: number) {
    await this.database.prepare(`
      UPDATE occupants
      SET building_id = ?, full_name = ?, document = ?, phone = ?, email = ?, floor = ?, unit = ?, is_active = ?, updated_by = ?
      WHERE id = ?
    `).run(input.building_id, input.full_name, input.document, input.phone, input.email, input.floor, input.unit, input.is_active, actorId, id);
  }

  async deactivate(id: number | string, actorId: number) {
    await this.database.prepare("UPDATE occupants SET is_active = 0, updated_by = ? WHERE id = ?").run(actorId, id);
  }

  async countPayments(id: number | string) {
    const result = await this.database.prepare(`
      SELECT COUNT(*) AS total
      FROM payments p
      JOIN receipt_allocations a ON p.allocation_id = a.id
      WHERE a.occupant_id = ?
    `).get(id);
    return Number(result?.total || 0);
  }

  async remove(id: number | string) {
    await this.database.prepare("DELETE FROM occupants WHERE id = ?").run(id);
  }
}

module.exports = { SqlOccupantRepository };
