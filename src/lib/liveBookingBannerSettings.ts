import { supabase } from '@/lib/supabase';

export const LIVE_BOOKING_BANNER_KEY = 'live_booking_banner_enabled';
export const LIVE_BOOKING_BANNER_CHANGED_EVENT = 'liveBookingBannerChanged';
const LIVE_BOOKING_BANNER_CACHE_KEY = 'hro_live_booking_banner_enabled';

function cacheEnabled(enabled: boolean) {
  try {
    sessionStorage.setItem(LIVE_BOOKING_BANNER_CACHE_KEY, enabled ? 'true' : 'false');
  } catch {
    /* ignore */
  }
}

function notifyEnabled(enabled: boolean) {
  cacheEnabled(enabled);
  window.dispatchEvent(
    new CustomEvent(LIVE_BOOKING_BANNER_CHANGED_EVENT, { detail: { enabled } })
  );
}

/** Missing row defaults to on so existing dashboards keep the live banner. */
export function readLiveBookingBannerEnabledCached(): boolean {
  try {
    const stored = sessionStorage.getItem(LIVE_BOOKING_BANNER_CACHE_KEY);
    if (stored === 'false') return false;
    if (stored === 'true') return true;
  } catch {
    /* ignore */
  }
  return true;
}

export async function fetchLiveBookingBannerEnabled(): Promise<{
  enabled: boolean;
  error: string | null;
}> {
  const { data, error } = await supabase
    .from('crm_settings')
    .select('value')
    .eq('key', LIVE_BOOKING_BANNER_KEY)
    .maybeSingle();

  if (error) return { enabled: true, error: error.message };
  const enabled = data?.value !== false;
  cacheEnabled(enabled);
  return { enabled, error: null };
}

export async function saveLiveBookingBannerEnabled(
  enabled: boolean
): Promise<{ ok: boolean; error: string | null }> {
  const { error } = await supabase.from('crm_settings').upsert(
    {
      key: LIVE_BOOKING_BANNER_KEY,
      value: enabled,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'key' }
  );

  if (error) return { ok: false, error: error.message };
  notifyEnabled(enabled);
  return { ok: true, error: null };
}
