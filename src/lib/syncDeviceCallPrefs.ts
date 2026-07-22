import { supabase } from '@/lib/supabase';

/** Push call-detect prefs to a device via silent FCM (updates native even if app is killed). */
export async function syncDeviceCallPrefsPush(opts: {
  token: string;
  kind: 'admin' | 'technician';
  callAlertsEnabled: boolean;
}): Promise<void> {
  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData?.session?.access_token;
  if (!accessToken) return;
  await fetch('/.netlify/functions/sync-device-call-prefs', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      token: opts.token,
      kind: opts.kind,
      callAlertsEnabled: opts.callAlertsEnabled,
    }),
  });
}
