import type { DatabasePort } from "../../domain/ports/database";
import type { PublicAllocationRepository } from "../../domain/shared/publicAllocationRepository";
const crypto = require("crypto");
const MAX_PUBLIC_LINK_TTL_HOURS = 24;
const DEFAULT_PUBLIC_LINK_TTL_HOURS = 24;

function parseDate(value) {
  if (value instanceof Date) return value;
  const text = String(value || "");
  const normalized = text.includes("T") || text.includes("GMT") ? text : `${text.replace(" ", "T")}Z`;
  return new Date(normalized);
}

export class SqlPublicAllocationRepository implements PublicAllocationRepository {
  constructor(private readonly database: DatabasePort) {}

  findLinkByToken(token: string) {
    return this.database.prepare("SELECT receipt_id, token, created_at, expires_at FROM public_allocation_links WHERE token = ?").get(token);
  }

  isLinkExpired(link: Record<string, any>) {
    const explicitExpiration = parseDate(link.expires_at);
    if (!Number.isNaN(explicitExpiration.getTime())) return explicitExpiration.getTime() <= Date.now();
    const createdAt = parseDate(link.created_at);
    const baseTime = Number.isNaN(createdAt.getTime()) ? 0 : createdAt.getTime();
    return baseTime + MAX_PUBLIC_LINK_TTL_HOURS * 60 * 60 * 1000 <= Date.now();
  }

  async publicLinkTtlHours() {
    const setting = await this.database.prepare("SELECT value FROM app_settings WHERE key = ?").get("public_link_ttl_hours");
    const configuredHours = Number(setting?.value);
    if (!Number.isFinite(configuredHours) || configuredHours <= 0) return DEFAULT_PUBLIC_LINK_TTL_HOURS;
    return Math.min(configuredHours, MAX_PUBLIC_LINK_TTL_HOURS);
  }

  async findOrCreateLink(receiptId: number | string) {
    const link = await this.database.prepare("SELECT token, created_at, expires_at FROM public_allocation_links WHERE receipt_id = ?").get(receiptId);
    if (link && !this.isLinkExpired(link)) return { token: String(link.token) };
    const token = crypto.randomBytes(32).toString("hex");
    const now = new Date();
    const expiresAt = new Date(now.getTime() + (await this.publicLinkTtlHours()) * 60 * 60 * 1000).toISOString();
    if (link) {
      await this.database.prepare("UPDATE public_allocation_links SET token = ?, created_at = ?, expires_at = ? WHERE receipt_id = ?")
        .run(token, now.toISOString(), expiresAt, receiptId);
    } else {
      await this.database.prepare("INSERT INTO public_allocation_links (receipt_id, token, created_at, expires_at) VALUES (?, ?, ?, ?)")
        .run(receiptId, token, now.toISOString(), expiresAt);
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