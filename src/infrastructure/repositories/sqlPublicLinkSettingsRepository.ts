import type { DatabasePort } from "../../domain/ports/database";
import type { PublicLinkSettingsRepository } from "../../domain/shared/publicLinkSettingsRepository";

const DEFAULT_PUBLIC_LINK_TTL_HOURS = 24;
const MAX_PUBLIC_LINK_TTL_HOURS = 24;

function normalizeHours(value: unknown) {
  const hours = Number(value);
  return Number.isInteger(hours) && hours >= 1 && hours <= MAX_PUBLIC_LINK_TTL_HOURS ? hours : DEFAULT_PUBLIC_LINK_TTL_HOURS;
}

export class SqlPublicLinkSettingsRepository implements PublicLinkSettingsRepository {
  constructor(private readonly database: DatabasePort) {}

  async defaultHours() {
    const setting = await this.database.prepare("SELECT value FROM app_settings WHERE key = ?").get("public_link_ttl_hours");
    return normalizeHours(setting?.value);
  }

  async updateDefaultHours(hours: number) {
    await this.database.prepare("UPDATE app_settings SET value = ? WHERE key = ?").run(String(hours), "public_link_ttl_hours");
  }
}

module.exports = { SqlPublicLinkSettingsRepository };