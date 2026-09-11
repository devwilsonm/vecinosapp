import type { DatabasePort } from "../../domain/ports/database";
import type { RoleRepository } from "../../domain/roles/roleRepository";

export class SqlRoleRepository implements RoleRepository {
  constructor(private readonly database: DatabasePort) {}

  list() {
    return this.database.prepare(`
      SELECT r.*, COUNT(rp.permission_id) AS permission_count
      FROM roles r
      LEFT JOIN role_permissions rp ON r.id = rp.role_id
      GROUP BY r.id
      ORDER BY r.is_system DESC, r.name
    `).all();
  }

  listActive() {
    return this.database.prepare("SELECT * FROM roles WHERE is_active = 1 ORDER BY is_system DESC, name").all();
  }

  findById(id: number | string) {
    return this.database.prepare("SELECT * FROM roles WHERE id = ?").get(id);
  }

  findActiveById(id: number) {
    return this.database.prepare("SELECT * FROM roles WHERE id = ? AND is_active = 1").get(id);
  }

  findByKey(key: string) {
    return this.database.prepare("SELECT * FROM roles WHERE key = ?").get(key);
  }

  async listSelectedPermissions(roleId: number | string) {
    const rows = await this.database.prepare("SELECT permission_id FROM role_permissions WHERE role_id = ?").all(roleId);
    return rows.map((row) => Number(row.permission_id));
  }

  async permissionsByModule() {
    const permissions = await this.listPermissions();
    return permissions.reduce<Record<string, Record<string, any>[]>>((groups, permission) => {
      if (!groups[permission.module]) groups[permission.module] = [];
      groups[permission.module].push(permission);
      return groups;
    }, {});
  }

  listPermissions() {
    return this.database.prepare("SELECT * FROM permissions ORDER BY module, name").all();
  }

  count() {
    return this.database.prepare("SELECT COUNT(*) AS total FROM roles").get().then((row) => Number(row?.total || 0));
  }

  keyExists(key: string) {
    return this.database.prepare("SELECT id FROM roles WHERE key = ?").get(key);
  }

  async create(input: Record<string, any>, permissionIds: number[], actorId: number) {
    const save = this.database.transaction(async () => {
      const result = await this.database.prepare(`
        INSERT INTO roles (name, key, description, is_system, is_active, created_by, updated_by)
        VALUES (?, ?, ?, 0, ?, ?, ?)
      `).run(input.name, input.key, input.description, input.is_active, actorId, actorId);
      const insertPermission = this.database.prepare("INSERT INTO role_permissions (role_id, permission_id) VALUES (?, ?)");
      for (const permissionId of permissionIds) await insertPermission.run(result.lastInsertRowid, permissionId);
      return result.lastInsertRowid;
    });
    return save();
  }

  async update(id: number | string, input: Record<string, any>, permissionIds: number[], actorId: number) {
    const save = this.database.transaction(async () => {
      await this.database.prepare("UPDATE roles SET name = ?, description = ?, is_active = ?, updated_by = ? WHERE id = ?").run(input.name, input.description, input.is_active, actorId, id);
      await this.database.prepare("DELETE FROM role_permissions WHERE role_id = ?").run(id);
      const insertPermission = this.database.prepare("INSERT INTO role_permissions (role_id, permission_id) VALUES (?, ?)");
      for (const permissionId of permissionIds) await insertPermission.run(id, permissionId);
    });
    await save();
  }
}

module.exports = { SqlRoleRepository };
