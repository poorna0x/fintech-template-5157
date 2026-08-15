export const HIDE_AMC_FOLLOW_UPS_KEY = 'admin_hide_amc_follow_ups';
export const COUNT_ONLY_NON_AMC_FOLLOW_UPS_KEY = 'admin_count_only_non_amc_follow_ups';
export const FOLLOW_UP_DISPLAY_SETTINGS_CHANGED_EVENT = 'followUpDisplaySettingsChanged';

export type FollowUpDisplaySettings = {
  hideAmcFollowUps: boolean;
  countOnlyNonAmcFollowUps: boolean;
};

function readDefaultOnBoolean(key: string): boolean {
  const stored = localStorage.getItem(key);
  return stored !== null ? stored === 'true' : true;
}

export function readFollowUpDisplaySettings(): FollowUpDisplaySettings {
  return {
    hideAmcFollowUps: readDefaultOnBoolean(HIDE_AMC_FOLLOW_UPS_KEY),
    countOnlyNonAmcFollowUps: readDefaultOnBoolean(COUNT_ONLY_NON_AMC_FOLLOW_UPS_KEY),
  };
}

export function saveFollowUpDisplaySettings(settings: FollowUpDisplaySettings): void {
  localStorage.setItem(HIDE_AMC_FOLLOW_UPS_KEY, String(settings.hideAmcFollowUps));
  localStorage.setItem(
    COUNT_ONLY_NON_AMC_FOLLOW_UPS_KEY,
    String(settings.countOnlyNonAmcFollowUps)
  );
  window.dispatchEvent(
    new CustomEvent(FOLLOW_UP_DISPLAY_SETTINGS_CHANGED_EVENT, { detail: settings })
  );
}
