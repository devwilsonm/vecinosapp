export interface ReportRepository {
  debtsByOccupant(canAccessAll: boolean, buildingIds: number[]): Promise<Record<string, any>[]>;
  pendingReceipts(canAccessAll: boolean, buildingIds: number[]): Promise<Record<string, any>[]>;
  paymentsByPeriod(canAccessAll: boolean, buildingIds: number[]): Promise<Record<string, any>[]>;
  receiptTotals(canAccessAll: boolean, buildingIds: number[]): Promise<Record<string, any>[]>;
}