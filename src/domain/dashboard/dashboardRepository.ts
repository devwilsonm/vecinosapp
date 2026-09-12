export interface DashboardRepository {
  countOccupants(buildingId: number): Promise<number>;
  countReceipts(buildingId: number): Promise<number>;
  countPendingReceipts(buildingId: number): Promise<number>;
  recentPayments(buildingId: number): Promise<Record<string, any>[]>;
  debts(buildingId: number): Promise<Record<string, any>[]>;
}