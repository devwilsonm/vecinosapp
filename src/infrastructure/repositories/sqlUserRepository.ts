import type { DatabasePort } from "../../domain/ports/database";
import type { UserInput, UserRepository } from "../../domain/users/userRepository";

export class SqlUserRepository implements UserRepository {
  constructor(private readonly database: DatabasePort) {}

  findActiveByEmail(email: string) {
    return this.database.prepare("SELECT * FROM users WHERE email = ? AND is_active = 1").get(email);
  }

  async updateTheme(userId: number, theme: "light" | "dark") {
    await this.database.prepare("UPDATE users SET theme = ? WHERE id = ?").run(theme, userId);
  }

  findSessionUser(userId: number) {
    return this.database.prepare(`
      SELECT u.id, u.role_id, u.full_name, u.email, u.theme, r.name AS role_name, r.key AS role_key
      FROM users u
      LEFT JOIN roles r ON u.role_id = r.id
      WHERE u.id = ? AND u.is_active = 1
    `).get(userId);
  }

  async listPermissionKeys(roleId: number) {
    const rows = await this.database.prepare(`
      SELECT p.key
      FROM permissions p
      JOIN role_permissions rp ON p.id = rp.permission_id
      WHERE rp.role_id = ?
    `).all(roleId);
    return rows.map((permission) => String(permission.key));
  }

  async listBuildingIds(userId: number) {
    const rows = await this.database.prepare("SELECT building_id FROM user_buildings WHERE user_id = ?").all(userId);
    return rows.map((row) => Number(row.building_id));
  }

  findById(id: number | string) {
    return this.database.prepare("SELECT * FROM users WHERE id = ?").get(id);
  }

  listWithRoles() {
    return this.database.prepare(`
      SELECT u.*, r.name AS role_name, r.key AS role_key,
        COUNT(ub.building_id) AS building_count
      FROM users u
      LEFT JOIN roles r ON u.role_id = r.id
      LEFT JOIN user_buildings ub ON u.id = ub.user_id
      GROUP BY u.id, r.name, r.key
      ORDER BY u.is_active DESC, u.full_name
    `).all();
  }

  async listAssignedBuildingIds(userId: number | string) {
    const rows = await this.database.prepare("SELECT building_id FROM user_buildings WHERE user_id = ?").all(userId);
    return rows.map((row) => Number(row.building_id));
  }

  findActiveRole(id: number) {
    return this.database.prepare("SELECT * FROM roles WHERE id = ? AND is_active = 1").get(id);
  }

  emailExists(email: string, excludedId = 0) {
    return this.database.prepare("SELECT id FROM users WHERE email = ? AND id != ?").get(email, excludedId);
  }

  count() {
    return this.database.prepare("SELECT COUNT(*) AS total FROM users").get().then((row) => Number(row?.total || 0));
  }

  maintenanceSummary() {
    return this.database.prepare("SELECT u.email, COUNT(*) AS total FROM users u GROUP BY u.id ORDER BY u.email").all();
  }

  async create(input: UserInput, assignedBuildingIds: number[], actorId: number) {
    const save = this.database.transaction(async () => {
      const result = await this.database.prepare(`
        INSERT INTO users (role_id, full_name, email, password_hash, is_active, created_by, updated_by)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(input.role_id, input.full_name, input.email, input.password_hash, input.is_active, actorId, actorId);
      const insertBuilding = this.database.prepare("INSERT INTO user_buildings (user_id, building_id) VALUES (?, ?)");
      for (const buildingId of assignedBuildingIds) await insertBuilding.run(result.lastInsertRowid, buildingId);
      return result.lastInsertRowid;
    });
    return save();
  }

  async update(id: number | string, input: UserInput, assignedBuildingIds: number[], actorId: number) {
    const save = this.database.transaction(async () => {
      if (input.password_hash) {
        await this.database.prepare("UPDATE users SET role_id = ?, full_name = ?, email = ?, password_hash = ?, is_active = ?, updated_by = ? WHERE id = ?").run(input.role_id, input.full_name, input.email, input.password_hash, input.is_active, actorId, id);
      } else {
        await this.database.prepare("UPDATE users SET role_id = ?, full_name = ?, email = ?, is_active = ?, updated_by = ? WHERE id = ?").run(input.role_id, input.full_name, input.email, input.is_active, actorId, id);
      }
      await this.database.prepare("DELETE FROM user_buildings WHERE user_id = ?").run(id);
      const insertBuilding = this.database.prepare("INSERT INTO user_buildings (user_id, building_id) VALUES (?, ?)");
      for (const buildingId of assignedBuildingIds) await insertBuilding.run(id, buildingId);
    });
    await save();
  }

  async deactivate(id: number | string, actorId: number) {
    await this.database.prepare("UPDATE users SET is_active = 0, updated_by = ? WHERE id = ?").run(actorId, id);
  }
}

module.exports = { SqlUserRepository };