import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';

const FRESH_FIX_TIMEOUT_MS = 40_000;

type LiveLocationRow = {
  technician_id: string;
  latitude: number | null;
  longitude: number | null;
  accuracy: number | null;
  updated_at: string;
  fix_time: string | null;
};

export type FreshTechLocation = {
  latitude: number;
  longitude: number;
  accuracy: number | null;
  fixTime: string;
};

/** Best-effort: keep measure-distance / assign on the same pin as live location. */
export async function mirrorLiveFixToTechnicianCurrentLocation(
  techId: string,
  latitude: number,
  longitude: number,
  accuracy: number | null
): Promise<void> {
  try {
    await supabase
      .from('technicians')
      .update({
        current_location: {
          latitude,
          longitude,
          lastUpdated: new Date().toISOString(),
          accuracy,
        },
      })
      .eq('id', techId);
  } catch {
    // Best-effort
  }
}

async function sendLocationPing(techId: string): Promise<void> {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData?.session?.access_token;
  if (!token) throw new Error('Not signed in');
  const res = await fetch('/.netlify/functions/send-location-ping', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ technicianId: techId }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.error || body?.reason || `Ping failed (${res.status})`);
  }
}

/**
 * Ask the technician phone for a fresh GPS fix (FCM ping + realtime).
 * Resolves with the first upload after the request, or null on timeout.
 */
export function requestTechnicianFreshLocation(
  technicianId: string,
  opts?: { timeoutMs?: number; signal?: AbortSignal }
): Promise<FreshTechLocation | null> {
  const techId = String(technicianId || '').trim();
  const timeoutMs = opts?.timeoutMs ?? FRESH_FIX_TIMEOUT_MS;

  return new Promise(async (resolve) => {
    if (!techId) {
      resolve(null);
      return;
    }

    let settled = false;
    let channel: RealtimeChannel | null = null;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let retryId: ReturnType<typeof setTimeout> | null = null;
    const requestedAt = Date.now();

    const finish = (value: FreshTechLocation | null) => {
      if (settled) return;
      settled = true;
      if (timeoutId) clearTimeout(timeoutId);
      if (retryId) clearTimeout(retryId);
      if (channel) void supabase.removeChannel(channel);
      opts?.signal?.removeEventListener('abort', onAbort);
      resolve(value);
    };

    const onAbort = () => finish(null);
    opts?.signal?.addEventListener('abort', onAbort);
    if (opts?.signal?.aborted) {
      finish(null);
      return;
    }

    const acceptRow = (row: LiveLocationRow | null | undefined) => {
      if (!row || row.latitude == null || row.longitude == null) return;
      // Any upload after our request (updated_at) counts — same as live-location dialog.
      const answered = new Date(row.updated_at).getTime() >= requestedAt - 30_000;
      if (!answered) return;
      finish({
        latitude: Number(row.latitude),
        longitude: Number(row.longitude),
        accuracy: row.accuracy != null ? Number(row.accuracy) : null,
        fixTime: row.fix_time || row.updated_at,
      });
    };

    channel = supabase
      .channel(`measure-live-loc-${techId}-${requestedAt}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'technician_live_locations',
          filter: `technician_id=eq.${techId}`,
        },
        (payload) => acceptRow(payload.new as LiveLocationRow)
      )
      .subscribe((status) => {
        if (status !== 'SUBSCRIBED' && status !== 'CHANNEL_ERROR' && status !== 'TIMED_OUT') {
          return;
        }
        void sendLocationPing(techId).catch(() => {
          // Retry once even if first ping fails to send.
        });
        // Second attempt after first GPS window — same as live-location dialog.
        retryId = setTimeout(() => {
          void sendLocationPing(techId).catch(() => {});
        }, timeoutMs);
      });

    timeoutId = setTimeout(async () => {
      // Last chance: read whatever is in the table now.
      try {
        const { data } = await supabase
          .from('technician_live_locations')
          .select('technician_id,latitude,longitude,accuracy,updated_at,fix_time')
          .eq('technician_id', techId)
          .maybeSingle();
        acceptRow(data as LiveLocationRow | null);
      } catch {
        /* ignore */
      }
      finish(null);
    }, timeoutMs * 2 + 5_000);
  });
}
