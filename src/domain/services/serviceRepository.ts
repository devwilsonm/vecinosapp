export interface ServiceRepository {
  list(buildingIds: number[]): Promise<Record<string, any>[]>;
  save(buildingId: number, name: string, active: number, actorId: number): Promise<void>;
}