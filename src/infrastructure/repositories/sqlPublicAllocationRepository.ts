import type { DatabasePort } from "../../domain/ports/database";
import type { PublicAllocationRepository } from "../../domain/shared/publicAllocationRepository";
const { createPublicToken, isPublicLinkExpired, publicLinkExpiration } = require("./publicLinkUtils");

export class SqlPublicAllocationRepository implements PublicAllocationRepository {
  constructor(private readonly database: DatabasePort) {}

  findLinkByToken(token: string) {
    return this.database.prepare("SELECT receipt_id, token, created_at, expires_at FROM public_allocation_links WHERE token = ?").get(token);
  }

  isLinkExpired(link: Record<string, any>) {
    return isPublicLinkExpired(link);
  }

  async publicLinkTtlHours() {
    const { createdAt, expiresAt } = await publicLinkExpiration(this.database);
    return (expiresAt.getTime() - createdAt.getTime()) / (60 * 60 * 1000);
  }

  async findOrCreateLink(receiptId: number | string) {
    const link = await this.database.prepare("SELECT token, created_at, expires_at FROM public_allocation_links WHERE receipt_id = ?").get(receiptId);
    if (link && !this.isLinkExpired(link)) return { token: String(link.token) };
    const token = createPublicToken();
    const { createdAt, expiresAt } = await publicLinkExpiration(this.database);
    if (link) {
      await this.database.prepare("UPDATE public_allocation_links SET token = ?, created_at = ?, expires_at = ? WHERE receipt_id = ?")
        .run(token, createdAt.toISOString(), expiresAt.toISOString(), receiptId);
    } else {
      await this.database.prepare("INSERT INTO public_allocation_links (receipt_id, token, created_at, expires_at) VALUES (?, ?, ?, ?)")
        .run(receiptId, token, createdAt.toISOString(), expiresAt.toISOString());
    }
    return { token };
  }

  findReceipt(id: number | string) {
    return this.database.prepare(`
      SELECT r.*, b.name AS building_name
      FROM receipts r
      LEFT JOIN buildings b ON r.building_id = b.id
      WHERE r.id = ?
    `).get(id);
  }

  listAllocations(id: number | string) {
    return this.database.prepare(`
      SELECT a.*, o.full_name, o.floor, o.unit
      FROM receipt_allocations a
      JOIN occupants o ON a.occupant_id = o.id
      WHERE a.receipt_id = ?
      ORDER BY CAST(o.floor AS INTEGER), o.floor, o.unit, o.full_name
    `).all(id);
  }
}

module.exports = { SqlPublicAllocationRepository };