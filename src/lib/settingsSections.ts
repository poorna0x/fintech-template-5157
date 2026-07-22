import { settingsPanelPath, type SettingsPanelSlug } from '@/lib/settingsUrl';

/** Known Settings deep-link section ids (`section-{id}` in the DOM). */
export const SETTINGS_SECTIONS = {
  'amount-trackers': true,
  reminders: true,
  'pending-payments': true,
  'technician-management': true,
  'email-tracking': true,
  'booking-intent-archive': true,
  calling: true,
  'device-tracker': true,
} as const;

export type SettingsSectionId = keyof typeof SETTINGS_SECTIONS;

export function settingsSectionElementId(section: string): string {
  return `section-${section}`;
}

/** Build `/settings?section=…` (optional `action` for post-scroll UI). */
export function settingsPath(section: SettingsSectionId, action?: string): string {
  if (section === 'calling' && action === 'open') {
    return settingsPanelPath('calling');
  }
  const qs = new URLSearchParams({ section });
  if (action) qs.set('action', action);
  return `/settings?${qs.toString()}`;
}

export { settingsPanelPath, type SettingsPanelSlug };
