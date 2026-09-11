export interface BuildingInput {
  name: string;
  address: string;
  floors: number;
  notes: string;
  is_active: number;
}

export interface BuildingRepository {
  listAccessible(userId: number, canAccessAll: boolean, buildingIds: number[]): Promise<Record<string, any>[]>;
  findById(id: number | string): Promise<Record<string, any> | undefined>;
  listOccupants(buildingId: number | string): Promise<Record<string, any>[]>;
  create(input: BuildingInput, actorId: number, assignToUser: boolean): Promise<number>;
  update(id: number | string, input: BuildingInput, actorId: number): Promise<void>;
  deactivate(id: number | string, actorId: number): Promise<void>;
  countOccupants(id: number | string): Promise<number>;
  remove(id: number | string): Promise<void>;
}
