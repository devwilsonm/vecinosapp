export interface OccupantInput {
  building_id: number;
  full_name: string;
  document: string;
  phone: string;
  email: string;
  floor: string;
  unit: string;
  is_active: number;
}

export interface OccupantRepository {
  listAccessible(canAccessAll: boolean, buildingIds: number[]): Promise<Record<string, any>[]>;
  findById(id: number | string): Promise<Record<string, any> | undefined>;
  findWithBuilding(id: number | string): Promise<Record<string, any> | undefined>;
  findBuildingForValidation(id: number): Promise<Record<string, any> | undefined>;
  findDuplicateDocument(document: string, excludedId: number): Promise<Record<string, any> | undefined>;
  listAllocations(id: number | string): Promise<Record<string, any>[]>;
  create(input: OccupantInput, actorId: number): Promise<number>;
  update(id: number | string, input: OccupantInput, actorId: number): Promise<void>;
  deactivate(id: number | string, actorId: number): Promise<void>;
  countPayments(id: number | string): Promise<number>;
  remove(id: number | string): Promise<void>;
}
