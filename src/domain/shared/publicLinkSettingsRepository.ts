export interface PublicLinkSettingsRepository {
  defaultHours(): Promise<number>;
  updateDefaultHours(hours: number): Promise<void>;
}
