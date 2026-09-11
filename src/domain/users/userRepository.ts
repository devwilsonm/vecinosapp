export interface UserInput {
  role_id: number;
  full_name: string;
  email: string;
  password_hash?: string;
  is_active: number;
}

export interface UserRepository {
  findActiveByEmail(email: string): Promise<Record<string, any> | undefined>;
  findSessionUser(userId: number): Promise<Record<string, any> | undefined>;
  listPermissionKeys(roleId: number): Promise<string[]>;
  listBuildingIds(userId: number): Promise<number[]>;
  findById(id: number | string): Promise<Record<string, any> | undefined>;
  listWithRoles(): Promise<Record<string, any>[]>;
  listAssignedBuildingIds(userId: number | string): Promise<number[]>;
  findActiveRole(id: number): Promise<Record<string, any> | undefined>;
  emailExists(email: string, excludedId?: number): Promise<Record<string, any> | undefined>;
  count(): Promise<number>;
  maintenanceSummary(): Promise<Record<string, any>[]>;
  create(input: UserInput, assignedBuildingIds: number[], actorId: number): Promise<number>;
  update(id: number | string, input: UserInput, assignedBuildingIds: number[], actorId: number): Promise<void>;
  deactivate(id: number | string, actorId: number): Promise<void>;
}
