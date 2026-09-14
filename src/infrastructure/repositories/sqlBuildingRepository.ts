import type { DatabasePort } from "../../domain/ports/database";
import type { BuildingInput, BuildingRepository } from "../../domain/buildings/buildingRepository";

export class SqlBuildingRepository implements BuildingRepository {
  constructor(private readonly database: DatabasePort) {}

  async listAccessible(canAccessAll: boolean, buildingIds: number[]) {
    if (!canAccessAll && !buildingIds.length) return [];
    const filter = canAccessAll ? "" : ` WHERE b.id IN (${buildingIds.map(() => "?").join(",")})`;
    const params = canAccessAll ? [] : buildingIds;
    return this.database.prepare(`
      SELECT b.*, COUNT(o.id) AS occupant_count
      FROM buildings b
      LEFT JOIN occupants o ON b.id = o.building_id
      ${filter}
      GROUP BY b.id
      ORDER BY b.is_active DESC, b.name
    `).all(...params);
  }

  listActive(canAccessAll: boolean, buildingIds: number[], selectedId: number) {
    if (!canAccessAll && !buildingIds.length) return Promise.resolve([]);
    if (canAccessAll) return this.database.prepare("SELECT * FROM buildings WHERE is_active = 1 OR id = ? ORDER BY name").all(selectedId);
    return this.database.prepare(`
      SELECT * FROM buildings
      WHERE id IN (${buildingIds.map(() => "?").join(",")})
        AND (is_active = 1 OR id = ?)
      ORDER BY name
    `).all(...buildingIds, selectedId);
  }

  listAllActive() {
    return this.database.prepare("SELECT * FROM buildings WHERE is_active = 1 ORDER BY name").all();
  }

  findById(id: number | string) {
    return this.database.prepare("SELECT * FROM buildings WHERE id = ?").get(id);
  }

  listOccupants(buildingId: number | string) {
    return this.database.prepare(`
      SELECT *
      FROM occupants
      WHERE building_id = ?
      ORDER BY CAST(floor AS INTEGER), floor, unit, full_name
    `).all(buildingId);
  }

  async create(input: BuildingInput, actorId: number, assignToUser: boolean) {
    const save = this.database.transaction(async () => {
      const result = await this.database.prepare(`
        INSERT INTO buildings (name, address, floors, notes, is_active, created_by, updated_by)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(input.name, input.address, input.floors, input.notes, input.is_active, actorId, actorId);
      if (assignToUser) {
        await this.database.prepare("INSERT INTO user_buildings (user_id, building_id) VALUES (?, ?)").run(actorId, result.lastInsertRowid);
      }
      return result.lastInsertRowid;
    });
    return save();
  }

  async update(id: number | string, input: BuildingInput, actorId: number) {
    await this.database.prepare(`
      UPDATE buildings
      SET name = ?, address = ?, floors = ?, notes = ?, is_active = ?, updated_by = ?
      WHERE id = ?
    `).run(input.name, input.address, input.floors, input.notes, input.is_active, actorId, id);
  }

  async updatePublicLinkTtlHours(id: number | string, hours: number, actorId: number) {
    await this.database.prepare("UPDATE buildings SET public_link_ttl_hours = ?, updated_by = ? WHERE id = ?")
      .run(hours, actorId, id);
  }

  async deactivate(id: number | string, actorId: number) {
    await this.database.prepare("UPDATE buildings SET is_active = 0, updated_by = ? WHERE id = ?").run(actorId, id);
  }

  async countOccupants(id: number | string) {
    const result = await this.database.prepare("SELECT COUNT(*) AS total FROM occupants WHERE building_id = ?").get(id);
    return Number(result?.total || 0);
  }

  async remove(id: number | string) {
    await this.database.prepare("DELETE FROM buildings WHERE id = ?").run(id);
  }
}

module.exports = { SqlBuildingRepository };
