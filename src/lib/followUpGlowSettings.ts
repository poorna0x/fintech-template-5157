export const FOLLOW_UP_GLOW_ENABLED_KEY = 'admin_follow_up_glow_enabled';
export const FOLLOW_UP_GLOW_CHANGED_EVENT = 'followUpGlowChanged';

export function isFollowUpGlowEnabled(): boolean {
  const stored = localStorage.getItem(FOLLOW_UP_GLOW_ENABLED_KEY);
  return stored !== null ? stored === 'true' : true;
}

export function setFollowUpGlowEnabled(enabled: boolean): void {
  localStorage.setItem(FOLLOW_UP_GLOW_ENABLED_KEY, enabled.toString());
  window.dispatchEvent(
    new CustomEvent(FOLLOW_UP_GLOW_CHANGED_EVENT, { detail: { enabled } })
  );
}
