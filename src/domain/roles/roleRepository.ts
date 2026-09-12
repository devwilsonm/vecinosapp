export interface RoleRepository {
  list(): Promise<Record<string, any>[]>;
  listActive(): Promise<Record<string, any>[]>;
  findById(id: number | string): Promise<Record<string, any> | undefined>;
  findActiveById(id: number): Promise<Record<string, any> | undefined>;
  findByKey(key: string): Promise<Record<string, any> | undefined>;
  listSelectedPermissions(roleId: number | string): Promise<number[]>;
  permissionsByModule(): Promise<Record<string, Record<string, any>[]>>;
  listPermissions(): Promise<Record<string, any>[]>;
  count(): Promise<number>;
  keyExists(key: string): Promise<Record<string, any> | undefined>;
  create(input: Record<string, any>, permissionIds: number[], actorId: number): Promise<number>;
  update(id: number | string, input: Record<string, any>, permissionIds: number[], actorId: number): Promise<void>;
}