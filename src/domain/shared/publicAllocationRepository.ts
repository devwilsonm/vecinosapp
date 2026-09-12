export interface PublicAllocationRepository {
  findLinkByToken(token: string): Promise<Record<string, any> | undefined>;
  findOrCreateLink(receiptId: number | string): Promise<{ token: string }>;
  isLinkExpired(link: Record<string, any>): boolean;
  findReceipt(id: number | string): Promise<Record<string, any> | undefined>;
  listAllocations(id: number | string): Promise<Record<string, any>[]>;
}