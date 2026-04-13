import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Phone, Volume2, VolumeX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { db, supabase } from '@/lib/supabase';

/** Throttle UPDATE pings (customer typing) so we don’t replay the job-completion sound every few seconds. */
const UPDATE_SOUND_GAP_MS = 8_000;
const MUTE_KEY = 'website_intent_beep_muted';

type Row = {
  id: string;
  full_name: string;
  phone: string;
  current_step: number;
  created_at: string;
  updated_at: string;
  site_key: string;
  booked_at?: string | null;
  booked_job_number?: string | null;
};

const SITE_LABEL: Record<string, string> = {
  hydrogenro: 'HydrogenRO',
  elevenro: 'ElevenRO',
};

const STEP_LABEL: Record<number, string> = {
  1: 'Personal',
  2: 'Service',
  3: 'Location',
  4: 'Schedule',
  5: 'Review',
};

function mergeRow(rows: Row[], raw: Record<string, unknown>): Row[] {
  const dismissed = raw.dismissed_at != null && raw.dismissed_at !== '';
  const id = raw.id as string | undefined;
  if (!id) return rows;
  if (dismissed) return rows.filter((r) => r.id !== id);

  const full_name = raw.full_name as string | undefined;
  const phone = raw.phone as string | undefined;
  const current_step = Number(raw.current_step);
  const updated_at = raw.updated_at as string | undefined;
  const booked_at = (raw.booked_at as string | undefined) ?? null;
  const booked_job_number = (raw.booked_job_number as string | undefined) ?? null;
  const site_key =
    typeof raw.site_key === 'string' && raw.site_key.length > 0 ? raw.site_key : 'hydrogenro';
  if (!full_name || !phone || !updated_at || Number.isNaN(current_step)) return rows;

  const existing = rows.find((r) => r.id === id);
  const created_at =
    (raw.created_at as string | undefined) || existing?.created_at || updated_at;

  const next: Row = {
    id,
    full_name,
    phone,
    current_step,
    created_at,
    updated_at,
    site_key,
    booked_at,
    booked_job_number,
  };
  const rest = rows.filter((r) => r.id !== id);
  const merged = [next, ...rest];
  merged.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
  return merged.slice(0, 10);
}

function formatStartedAt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const tz = 'Asia/Kolkata';
  const date = new Intl.DateTimeFormat('en-IN', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
  const today = new Intl.DateTimeFormat('en-IN', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  const time = new Intl.DateTimeFormat('en-IN', {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
  return date === today ? time : `${date} ${time}`;
}

type Props = {
  /** Same as job-completion: uses shared AudioContext primed on first click/keydown in admin. */
  playAlert?: () => void | Promise<void>;
  /** Stop any ongoing alert sound (e.g., when the row is dismissed). */
  stopAlert?: () => void;
};

export function WebsiteBookingIntentBanner({ playAlert, stopAlert }: Props) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [muted, setMuted] = useState(() => {
    try {
      return sessionStorage.getItem(MUTE_KEY) === '1';
    } catch {
      return false;
    }
  });
  const [dismissingId, setDismissingId] = useState<string | null>(null);
  const mutedRef = useRef(muted);
  mutedRef.current = muted;
  const lastUpdateSoundAtRef = useRef(0);

  const load = useCallback(async () => {
    const { data, error } = await db.websiteBookingIntent.listActive(10);
    if (!error && data) setRows(data as Row[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
    const lastFocusFetchAt = { t: 0 };
    const subscribedRef = { ok: false };
    let fallbackInterval: ReturnType<typeof setInterval> | null = null;

    const channel = supabase
      .channel('admin-website-booking-intent')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'website_booking_intent' },
        (payload) => {
          if (payload.eventType === 'DELETE') {
            const id = (payload.old as { id?: string })?.id;
            if (id) setRows((prev) => prev.filter((r) => r.id !== id));
            return;
          }

          const row = payload.new as Record<string, unknown>;
          if (!row || typeof row !== 'object') return;

          if (payload.eventType === 'INSERT') {
            // If realtime payload is "thin", still beep immediately (then refetch for details).
            if (!mutedRef.current && playAlert && !(row.dismissed_at != null && row.dismissed_at !== '')) {
              void Promise.resolve(playAlert());
            }
            // Always refetch once on INSERT so the banner updates immediately even if realtime misses/omits columns.
            void load();
            // Some realtime configurations may omit columns; fall back to a refresh.
            if (
              typeof row.full_name !== 'string' ||
              typeof row.phone !== 'string' ||
              row.updated_at == null ||
              row.current_step == null
            ) {
              void load();
            }
            setRows((prev) => mergeRow(prev, row));
            if (row.dismissed_at) return;
            return;
          }

          if (payload.eventType === 'UPDATE') {
            const wasDismiss =
              row.dismissed_at != null &&
              row.dismissed_at !== '' &&
              (payload.old as { dismissed_at?: unknown } | null)?.dismissed_at == null;
            if (
              typeof row.full_name !== 'string' ||
              typeof row.phone !== 'string' ||
              row.updated_at == null ||
              row.current_step == null
            ) {
              void load();
            }
            setRows((prev) => mergeRow(prev, row));
            if (wasDismiss || row.dismissed_at) return;
            // If the booking was successfully submitted, show it as "Booked" but don't beep.
            if (row.booked_at != null && row.booked_at !== '') return;

            const now = Date.now();
            if (mutedRef.current || !playAlert) return;
            if (now - lastUpdateSoundAtRef.current < UPDATE_SOUND_GAP_MS) return;
            lastUpdateSoundAtRef.current = now;
            void Promise.resolve(playAlert());
          }
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          subscribedRef.ok = true;
          if (fallbackInterval) {
            clearInterval(fallbackInterval);
            fallbackInterval = null;
          }
          return;
        }
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.warn('[WebsiteBookingIntentBanner] realtime subscribe:', status);
          void load();
        }
      });

    // If realtime doesn't subscribe, poll lightly while tab is visible.
    // This keeps the banner usable without requiring a manual refresh.
    const startFallback = () => {
      if (fallbackInterval) return;
      fallbackInterval = setInterval(() => {
        if (document.visibilityState !== 'visible') return;
        if (subscribedRef.ok) return;
        void load();
      }, 10_000);
    };
    const fallbackTimer = setTimeout(() => {
      if (!subscribedRef.ok) startFallback();
    }, 2500);

    const onVis = () => {
      if (document.visibilityState !== 'visible') return;
      const now = Date.now();
      if (now - lastFocusFetchAt.t < 5 * 60_000) return;
      lastFocusFetchAt.t = now;
      void load();
    };
    document.addEventListener('visibilitychange', onVis);

    const onOnline = () => void load();
    window.addEventListener('online', onOnline);

    return () => {
      clearTimeout(fallbackTimer);
      if (fallbackInterval) clearInterval(fallbackInterval);
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('online', onOnline);
      supabase.removeChannel(channel);
    };
  }, [load, playAlert]);

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    // Make mute effective immediately for any in-flight realtime events.
    mutedRef.current = next;
    try {
      if (next) sessionStorage.setItem(MUTE_KEY, '1');
      else sessionStorage.removeItem(MUTE_KEY);
    } catch {
      /* ignore */
    }
  };

  const onDismiss = async (id: string) => {
    // Stop sound immediately on dismiss click (even before network roundtrip).
    stopAlert?.();
    setDismissingId(id);
    const { error } = await db.websiteBookingIntent.dismiss(id);
    setDismissingId(null);
    if (!error) setRows((prev) => prev.filter((r) => r.id !== id));
  };

  const hasRows = rows.length > 0;

  if (loading) return null;
  if (!hasRows) return null;

  return (
    <div
      className="mb-4 rounded-lg border border-emerald-500/70 bg-emerald-50 px-3 py-3 shadow-sm"
      role="status"
      aria-live="polite"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-emerald-950">Live booking (website)</p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 border-emerald-300 bg-white shrink-0"
          onClick={toggleMute}
          title={muted ? 'Unmute' : 'Mute'}
        >
          {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
        </Button>
      </div>
      <ul className="mt-3 space-y-2">
        {rows.map((r) => (
          <li
            key={r.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-white/90 border border-emerald-200/90 px-2 py-2 text-sm"
          >
            <div className="min-w-0 flex flex-wrap items-center gap-x-3 gap-y-1">
              <span
                className="shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-emerald-900"
                title="Which public site"
              >
                {SITE_LABEL[r.site_key] ?? r.site_key}
              </span>
              <span className="font-medium text-gray-900 truncate">{r.full_name}</span>
              <a
                href={`tel:${r.phone.replace(/\D/g, '')}`}
                className="inline-flex items-center gap-1 text-blue-700 font-mono tabular-nums hover:underline"
              >
                <Phone className="w-3.5 h-3.5 shrink-0" />
                {r.phone}
              </a>
              <span className="text-xs text-gray-600">
                Step {r.current_step}: {STEP_LABEL[r.current_step] ?? '—'}
              </span>
              {r.booked_at ? (
                <span
                  className="shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-emerald-900"
                  title={r.booked_job_number ? `Job: ${r.booked_job_number}` : 'Booked'}
                >
                  Booked
                </span>
              ) : null}
              <span className="text-xs text-gray-600">
                Started: {formatStartedAt(r.created_at)}
              </span>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs text-gray-500 hover:text-gray-900 shrink-0"
              disabled={dismissingId === r.id}
              onClick={() => void onDismiss(r.id)}
            >
              {dismissingId === r.id ? '…' : 'Done'}
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
