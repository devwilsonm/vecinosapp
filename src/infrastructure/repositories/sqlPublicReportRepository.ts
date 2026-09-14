import type { DatabasePort } from "../../domain/ports/database";
import type { PublicReportRepository } from "../../domain/shared/publicReportRepository";
const { createPublicToken, isPublicLinkExpired, publicLinkExpiration } = require("./publicLinkUtils");

export class SqlPublicReportRepository implements PublicReportRepository {
  constructor(private readonly database: DatabasePort) {}

  findLinkByToken(token: string) {
    return this.database.prepare("SELECT token, from_month, to_month, service_type, building_ids, created_at, expires_at FROM public_report_links WHERE token = ?").get(token);
  }

  async createLink(filters: Record<string, any>) {
    const token = createPublicToken();
    const buildingIds = Array.isArray(filters.buildingIds) ? filters.buildingIds : [];
    const buildingId = buildingIds.length === 1 ? Number(buildingIds[0]) : 0;
    const { createdAt, expiresAt } = await publicLinkExpiration(this.database, buildingId);
    await this.database.prepare(`
      INSERT INTO public_report_links (token, from_month, to_month, service_type, building_ids, created_at, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(token, filters.fromMonth, filters.toMonth, filters.serviceType, JSON.stringify(filters.buildingIds || []), createdAt.toISOString(), expiresAt.toISOString());
    return { token, expiresAt: expiresAt.toISOString() };
  }

  isLinkExpired(link: Record<string, any>) {
    return isPublicLinkExpired(link);
  }
}

module.exports = { SqlPublicReportRepository };
