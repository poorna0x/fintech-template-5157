import { supabase } from '@/lib/supabase';

/** Push device prefs via silent FCM (updates native even if app is killed). */
export async function syncDeviceCallPrefsPush(opts: {
  token: string;
  kind: 'admin' | 'technician';
  callAlertsEnabled?: boolean;
  wrongLineReminderEnabled?: boolean;
}): Promise<void> {
  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData?.session?.access_token;
  if (!accessToken) return;
  const body: Record<string, unknown> = {
    token: opts.token,
    kind: opts.kind,
  };
  if (typeof opts.callAlertsEnabled === 'boolean') {
    body.callAlertsEnabled = opts.callAlertsEnabled;
  }
  if (typeof opts.wrongLineReminderEnabled === 'boolean') {
    body.wrongLineReminderEnabled = opts.wrongLineReminderEnabled;
  }
  await fetch('/.netlify/functions/sync-device-call-prefs', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(body),
  });
}
