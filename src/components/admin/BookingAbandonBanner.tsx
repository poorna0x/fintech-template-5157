import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Phone, PhoneOff, Volume2, VolumeX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { db, supabase } from '@/lib/supabase';

const BEEP_INTERVAL_MS = 1_600;
const MUTE_KEY = 'booking_abandon_beep_muted';

type Row = {
  id: string;
  full_name: string;
  phone: string;
  step_reached: number;
  created_at: string;
};

const STEP_LABEL: Record<number, string> = {
  1: 'Personal',
  2: 'Service',
  3: 'Location',
  4: 'Schedule',
  5: 'Review',
};

function useAttentionBeep(active: boolean, muted: boolean) {
  const ctxRef = useRef<AudioContext | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!active || muted) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      void ctxRef.current?.close();
      ctxRef.current = null;
      return;
    }

    let cancelled = false;

    const run = async () => {
      try {
        const ctx = new AudioContext();
        ctxRef.current = ctx;
        await ctx.resume();

        const playOnce = () => {
          if (cancelled || !ctxRef.current) return;
          const c = ctxRef.current;
          const o = c.createOscillator();
          const g = c.createGain();
          o.type = 'sine';
          o.frequency.value = 880;
          g.gain.setValueAtTime(0.1, c.currentTime);
          g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.12);
          o.connect(g);
          g.connect(c.destination);
          o.start();
          o.stop(c.currentTime + 0.13);
        };

        playOnce();
        intervalRef.current = setInterval(playOnce, BEEP_INTERVAL_MS);
      } catch {
        /* autoplay or AudioContext unsupported */
      }
    };

    void run();

    return () => {
      cancelled = true;
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      void ctxRef.current?.close();
      ctxRef.current = null;
    };
  }, [active, muted]);
}

export function BookingAbandonBanner() {
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

  const load = useCallback(async () => {
    const { data, error } = await db.bookingAbandonments.listActivePending(12);
    if (!error && data) {
      setRows(data as Row[]);
    }
    setLoading(false);
  }, []);

  const mergeRealtimeRow = useCallback((raw: Record<string, unknown>) => {
    const dismissed = raw.dismissed_at != null && raw.dismissed_at !== '';
    if (dismissed) {
      const id = raw.id as string;
      if (id) setRows((prev) => prev.filter((r) => r.id !== id));
      return;
    }
    const id = raw.id as string | undefined;
    const full_name = raw.full_name as string | undefined;
    const phone = raw.phone as string | undefined;
    const step_reached = Number(raw.step_reached);
    const created_at = raw.created_at as string | undefined;
    if (!id || !full_name || !phone || !created_at || Number.isNaN(step_reached)) return;
    const next: Row = { id, full_name, phone, step_reached, created_at };
    setRows((prev) => {
      const without = prev.filter((r) => r.id !== id);
      const merged = [next, ...without];
      merged.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      return merged.slice(0, 12);
    });
  }, []);

  /** One slim HTTP read on mount + postgres Realtime (no polling). Optional refetch on tab focus at most every 5 min (missed events / reconnect). */
  useEffect(() => {
    void load();
    const lastFocusFetchAt = { t: 0 };

    const channel = supabase
      .channel('admin-booking-abandonments')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'booking_abandonments' },
        (payload) => mergeRealtimeRow(payload.new as Record<string, unknown>)
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'booking_abandonments' },
        (payload) => mergeRealtimeRow(payload.new as Record<string, unknown>)
      )
      .subscribe();

    const onVis = () => {
      if (document.visibilityState !== 'visible') return;
      const now = Date.now();
      if (now - lastFocusFetchAt.t < 5 * 60_000) return;
      lastFocusFetchAt.t = now;
      void load();
    };
    document.addEventListener('visibilitychange', onVis);

    return () => {
      document.removeEventListener('visibilitychange', onVis);
      supabase.removeChannel(channel);
    };
  }, [load, mergeRealtimeRow]);

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    try {
      if (next) sessionStorage.setItem(MUTE_KEY, '1');
      else sessionStorage.removeItem(MUTE_KEY);
    } catch {
      /* ignore */
    }
  };

  const onDismiss = async (id: string) => {
    setDismissingId(id);
    const { error } = await db.bookingAbandonments.dismiss(id);
    setDismissingId(null);
    if (!error) {
      setRows((prev) => prev.filter((r) => r.id !== id));
    }
  };

  const hasPending = rows.length > 0;
  useAttentionBeep(hasPending, muted);

  if (loading) return null;
  if (!hasPending) return null;

  return (
    <div
      className="mb-4 rounded-lg border border-amber-400/80 bg-amber-50 px-3 py-3 shadow-sm"
      role="status"
      aria-live="polite"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-amber-950">
            Booking abandoned — call back now
          </p>
          <p className="text-xs text-amber-900/80 mt-0.5">
            Left the website mid-booking (name &amp; phone on file). Beeps until dismissed or muted.
          </p>
        </div>
        <div className="flex shrink-0 gap-1">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 border-amber-300 bg-white"
            onClick={toggleMute}
            title={muted ? 'Unmute reminder beeps' : 'Mute beeps this session'}
          >
            {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </Button>
        </div>
      </div>
      <ul className="mt-3 space-y-2">
        {rows.map((r) => (
          <li
            key={r.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-white/90 border border-amber-200/80 px-2 py-2 text-sm"
          >
            <div className="min-w-0 flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="font-medium text-gray-900 truncate">{r.full_name}</span>
              <a
                href={`tel:${r.phone.replace(/\D/g, '')}`}
                className="inline-flex items-center gap-1 text-blue-700 font-mono tabular-nums hover:underline"
              >
                <Phone className="w-3.5 h-3.5 shrink-0" />
                {r.phone}
              </a>
              <span className="text-xs text-gray-600">
                Step {r.step_reached}: {STEP_LABEL[r.step_reached] ?? '—'}
              </span>
            </div>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="h-8 shrink-0"
              disabled={dismissingId === r.id}
              onClick={() => void onDismiss(r.id)}
            >
              {dismissingId === r.id ? (
                <span className="text-xs">…</span>
              ) : (
                <>
                  <PhoneOff className="w-3.5 h-3.5 mr-1" />
                  Dismiss
                </>
              )}
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
