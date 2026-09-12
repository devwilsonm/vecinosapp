export interface PaymentInput {
  allocation_id: number;
  amount_cents: number;
  payment_date: string;
  payment_method: string;
  note: string;
}

export interface PaymentRepository {
  listPendingByBuilding(buildingId: number): Promise<Record<string, any>[]>;
  listByBuilding(buildingId: number): Promise<Record<string, any>[]>;
  findAllocation(id: number | string): Promise<Record<string, any> | undefined>;
  create(input: PaymentInput, actorId: number): Promise<number>;
  markAllocationUpdated(id: number | string, actorId: number): Promise<void>;
  markReceiptUpdated(id: number | string, actorId: number): Promise<void>;
}