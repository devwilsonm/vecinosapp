import type { DatabasePort } from "../../domain/ports/database";
import type { PublicAllocationRepository } from "../../domain/shared/publicAllocationRepository";
const crypto = require("crypto");

export class SqlPublicAllocationRepository implements PublicAllocationRepository {
  constructor(private readonly database: DatabasePort) {}

  findLinkByToken(token: string) {
    return this.database.prepare("SELECT receipt_id FROM public_allocation_links WHERE token = ?").get(token);
  }

  async findOrCreateLink(receiptId: number | string) {
    let link = await this.database.prepare("SELECT token FROM public_allocation_links WHERE receipt_id = ?").get(receiptId);
    if (link) return { token: String(link.token) };
    const token = crypto.randomBytes(32).toString("hex");
    await this.database.prepare("INSERT INTO public_allocation_links (receipt_id, token) VALUES (?, ?)").run(receiptId, token);
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