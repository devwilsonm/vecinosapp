export interface AllocationData {
  occupant_id: number;
  assigned_amount_cents: number;
  consumption_milli: number;
}

export interface AllocationRepository {
  listReceipts(canAccessAll: boolean, buildingIds: number[]): Promise<Record<string, any>[]>;
  findReceipt(id: number | string): Promise<Record<string, any> | undefined>;
  listFormOccupants(buildingId: number, occupantIds?: number[]): Promise<Record<string, any>[]>;
  listByReceipt(id: number | string): Promise<Record<string, any>[]>;
  countByReceipt(id: number | string): Promise<number>;
  countPaymentsByReceipt(id: number | string): Promise<number>;
  replace(receiptId: number | string, allocations: AllocationData[], actorId: number): Promise<void>;
  markReceiptUpdated(receiptId: number | string, actorId: number): Promise<void>;
  updateAllocationStatus(allocationId: number | string): Promise<void>;
  updateReceiptStatus(receiptId: number | string): Promise<void>;
}
