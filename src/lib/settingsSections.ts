/** Known Settings deep-link section ids (`section-{id}` in the DOM). */
export const SETTINGS_SECTIONS = {
  'amount-trackers': true,
  reminders: true,
  'pending-payments': true,
  'technician-management': true,
  'email-tracking': true,
} as const;

export type SettingsSectionId = keyof typeof SETTINGS_SECTIONS;

export function settingsSectionElementId(section: string): string {
  return `section-${section}`;
}

/** Build `/settings?section=…` (optional `action` for post-scroll UI). */
export function settingsPath(section: SettingsSectionId, action?: string): string {
  const qs = new URLSearchParams({ section });
  if (action) qs.set('action', action);
  return `/settings?${qs.toString()}`;
}
