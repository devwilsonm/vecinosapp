export interface PublicReportRepository {
  findLinkByToken(token: string): Promise<Record<string, any> | undefined>;
  createLink(filters: Record<string, any>): Promise<{ token: string; expiresAt: string }>;
  isLinkExpired(link: Record<string, any>): boolean;
}