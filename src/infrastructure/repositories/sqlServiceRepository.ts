import type { DatabasePort } from "../../domain/ports/database";
import type { ServiceRepository } from "../../domain/services/serviceRepository";

export class SqlServiceRepository implements ServiceRepository {
  constructor(private readonly database: DatabasePort) {}

  list(buildingIds: number[]) {
    if (!buildingIds.length) return Promise.resolve([]);
    return this.database.prepare(`SELECT * FROM building_services WHERE building_id IN (${buildingIds.map(() => "?").join(",")}) ORDER BY name`).all(...buildingIds);
  }

  async save(buildingId: number, name: string, active: number, actorId: number) {
    await this.database.prepare(`INSERT INTO building_services (building_id, name, is_active, created_by, updated_by)
      VALUES (?, ?, ?, ?, ?) ON CONFLICT (building_id, name)
      DO UPDATE SET is_active = excluded.is_active, updated_by = excluded.updated_by`).run(buildingId, name, active, actorId, actorId);
  }
}