import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { ExternalLink, Loader2, MapPin, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/lib/supabase';
import type { RealtimeChannel } from '@supabase/supabase-js';
import type { Technician } from '@/types';
import { isActiveTechnicianAccount } from '@/lib/technicianAccountStatus';

type LiveLocationRow = {
  technician_id: string;
  latitude: number | null;
  longitude: number | null;
  accuracy: number | null;
  is_tracking: boolean;
  updated_at: string;
  /** When the GPS fix was measured (null on rows from older app builds). */
  fix_time: string | null;
};

type TechnicianLiveLocationDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  technicians: Technician[];
};

/** Per attempt: the phone's GPS window is ~30s, plus push + upload latency. */
const FRESH_FIX_TIMEOUT_MS = 40_000;
/** A fix measured within this window counts as the current location. */
const FRESH_FIX_MAX_AGE_MS = 2 * 60_000;

/** When the shown coordinates were actually measured. */
function fixTimeOf(row: LiveLocationRow): string {
  return row.fix_time ?? row.updated_at;
}

/** Keep measure-distance / assign / settings on the same pin as live location. */
async function mirrorExactToTechnicianCurrentLocation(
  techId: string,
  latitude: number,
  longitude: number,
  accuracy: number | null
) {
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
    // Best-effort; live map is already correct.
  }
}

function agoLabel(iso: string): string {
  const secs = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ${mins % 60}m ago`;
  return new Date(iso).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
}

/**
 * Relative time that ticks locally. Must not live in the dialog parent —
 * a parent setInterval re-render remounts the Google Maps iframe.
 */
function RelativeAgo({ iso }: { iso: string }) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 1_000);
    return () => clearInterval(t);
  }, [iso]);
  return <>{agoLabel(iso)}</>;
}

/** Map iframe only remounts when lat/lng change (not on label ticks / badge updates). */
const LiveLocationMap = React.memo(function LiveLocationMap({
  latitude,
  longitude,
}: {
  latitude: number;
  longitude: number;
}) {
  const src = `https://maps.google.com/maps?q=${latitude},${longitude}&z=16&output=embed`;
  return (
    <div className="overflow-hidden bg-muted">
      <iframe
        title="Technician location map"
        src={src}
        className="h-[46vh] min-h-[240px] w-full sm:h-80"
        loading="lazy"
        referrerPolicy="no-referrer-when-downgrade"
      />
    </div>
  );
});

const TechnicianLiveLocationDialog = ({
  open,
  onOpenChange,
  technicians,
}: TechnicianLiveLocationDialogProps) => {
  const [technicianId, setTechnicianId] = useState<string>('');
  const [row, setRow] = useState<LiveLocationRow | null>(null);
  const [loading, setLoading] = useState(false);
  const [noRow, setNoRow] = useState(false);
  // True while we hide the stale location behind a loader, waiting for the
  // phone to answer our request with ANY upload (WhatsApp-style: show the
  // first response immediately, then keep refining as better fixes arrive).
  const [waitingFresh, setWaitingFresh] = useState(false);
  // The phone's first reply is usually its CACHED position; the GPS-measured
  // fix follows a few seconds later. This tracks whether the position on
  // screen was actually measured after our request (i.e. it's exact).
  const [exactFix, setExactFix] = useState(false);
  // The phone didn't respond in time — we're showing the last known location.
  const [timedOut, setTimedOut] = useState(false);

  const channelRef = useRef<RealtimeChannel | null>(null);
  const freshTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestedAtRef = useRef(0);

  const sendPing = useCallback(async (techId: string) => {
    // One call does everything: stamps the request, creates the one-time
    // nonce and sends the FCM push that the app's native handler answers
    // (even when Android has killed the app).
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) return;
      await fetch('/.netlify/functions/send-location-ping', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ technicianId: techId }),
      });
    } catch {
      // Best-effort; the timeout fallback shows the last known location.
    }
  }, []);

  const cleanup = useCallback(() => {
    if (freshTimeoutRef.current) {
      clearTimeout(freshTimeoutRef.current);
      freshTimeoutRef.current = null;
    }
    if (channelRef.current) {
      void supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }
  }, []);

  const startWatching = useCallback(
    async (techId: string, force = false) => {
      cleanup();
      setLoading(true);
      setRow(null);
      setNoRow(false);
      setWaitingFresh(false);
      setExactFix(false);
      setTimedOut(false);

      const { data } = await supabase
        .from('technician_live_locations')
        .select('technician_id,latitude,longitude,accuracy,is_tracking,updated_at,fix_time')
        .eq('technician_id', techId)
        .maybeSingle();

      setLoading(false);
      if (!data) {
        setNoRow(true);
        return;
      }
      setRow(data as LiveLocationRow);

      const existing = data as LiveLocationRow;
      const alreadyFresh =
        existing.latitude != null &&
        Date.now() - new Date(fixTimeOf(existing)).getTime() < FRESH_FIX_MAX_AGE_MS;
      if (alreadyFresh && !force) {
        setExactFix(true);
        // No ping this time — still push the fresh pin into current_location
        // so measure-distance / assign see it without waiting for another open.
        if (existing.latitude != null && existing.longitude != null) {
          void mirrorExactToTechnicianCurrentLocation(
            techId,
            existing.latitude,
            existing.longitude,
            existing.accuracy
          );
        }
      }

      // Only ping when needed: sharing is on and the stored fix isn't already
      // current (saves the push, the GPS wake-up and the uploads). An explicit
      // Refresh click (force) always asks the phone for a new measurement.
      const shouldPing = existing.is_tracking && (force || !alreadyFresh);
      if (shouldPing) {
        requestedAtRef.current = Date.now();
        // Full loader until the phone's FIRST answer — except on a forced
        // Refresh with a position already on screen: keep the map visible and
        // let the inline "getting the exact location" note show instead.
        setWaitingFresh(!(force && existing.latitude != null));
      }

      // Two attempts: GPS often fails to lock in the phone's first 30s window
      // (indoors) but succeeds right after because the chip is warmed up, so
      // one silent retry roughly doubles the success rate at no extra cost
      // when the first attempt works. requestedAt stays at the FIRST attempt:
      // any fix measured after the admin asked counts as exact.
      let attempt = 0;
      const requestFix = () => {
        attempt += 1;
        void sendPing(techId);
        freshTimeoutRef.current = setTimeout(() => {
          if (attempt < 2) {
            requestFix();
          } else {
            setWaitingFresh(false);
            setTimedOut(true);
          }
        }, FRESH_FIX_TIMEOUT_MS);
      };

      // The ping is sent only after the realtime channel is live (see
      // subscribe callback below) — the phone's cached answer can arrive
      // within a second, before a listener created afterwards would be ready,
      // and a missed update means waiting out the full timeout for nothing.
      let pinged = false;

      channelRef.current = supabase
        .channel(`admin-live-loc-${techId}`)
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'technician_live_locations',
            filter: `technician_id=eq.${techId}`,
          },
          (payload) => {
            const next = payload.new as LiveLocationRow;
            if (!next) return;
            setRow(next);
            // ANY upload that arrived after our request ends the loader —
            // show the phone's first answer right away (usually its cached
            // Google location, which is quite fresh) and let later fixes
            // refine the map. updated_at is the upload time, so the ping
            // stamp echo (which doesn't touch updated_at) fails this check.
            // 30s margin covers browser/server clock skew.
            const answered =
              next.latitude != null &&
              new Date(next.updated_at).getTime() >= requestedAtRef.current - 30_000;
            if (answered) {
              setWaitingFresh(false);
              setTimedOut(false);
            }
            // Only a fix MEASURED after our request counts as the exact
            // current position (fix_time is when GPS took the measurement;
            // the cached first answer carries an older fix_time and fails).
            const measuredNow =
              next.latitude != null &&
              next.fix_time != null &&
              new Date(next.fix_time).getTime() >= requestedAtRef.current - 30_000;
            if (measuredNow) {
              if (freshTimeoutRef.current) {
                clearTimeout(freshTimeoutRef.current);
                freshTimeoutRef.current = null;
              }
              setExactFix(true);
            }
          }
        )
        .subscribe((status) => {
          // Realtime broken: ping anyway — updates won't stream in, but the
          // phone's upload still lands in the row for the Refresh button.
          const ready = status === 'SUBSCRIBED';
          const broken = status === 'CHANNEL_ERROR' || status === 'TIMED_OUT';
          if ((ready || broken) && shouldPing && !pinged) {
            pinged = true;
            requestFix();
          }
        });
    },
    [cleanup, sendPing]
  );

  useEffect(() => {
    if (!open) {
      cleanup();
      setRow(null);
      setNoRow(false);
      setWaitingFresh(false);
      setExactFix(false);
      setTimedOut(false);
      return;
    }
    if (technicianId) void startWatching(technicianId);
    return cleanup;
  }, [open, technicianId, startWatching, cleanup]);

  const activeTechs = technicians.filter((t) => {
    if ((t as any).isActive === false) return false;
    return isActiveTechnicianAccount(t);
  });
  const hasCoords = row != null && row.latitude != null && row.longitude != null;
  const techName = (t: Technician) => t.fullName || (t as { full_name?: string }).full_name || 'Technician';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[92vh] w-[calc(100vw-1.25rem)] max-w-lg flex-col gap-0 overflow-hidden p-0 sm:w-full">
        <DialogHeader className="space-y-3 px-4 py-3 pr-12 text-left">
          <DialogTitle className="flex items-center gap-2.5 text-base">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
              <MapPin className="h-4 w-4" />
            </span>
            Technician location
          </DialogTitle>
          <DialogDescription className="sr-only">
            Shows the technician's current location on a map.
          </DialogDescription>
          <Select value={technicianId} onValueChange={setTechnicianId}>
            <SelectTrigger className="h-11">
              <SelectValue placeholder="Select technician" />
            </SelectTrigger>
            <SelectContent>
              {activeTechs.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  <span className="flex items-center gap-2">
                    {t.photo ? (
                      <img src={t.photo} alt="" className="h-6 w-6 rounded-full object-cover" />
                    ) : (
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-muted text-[10px] font-semibold">
                        {(techName(t)[0] || '?').toUpperCase()}
                      </span>
                    )}
                    <span className="truncate">{techName(t)}</span>
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </DialogHeader>

        <div className="min-h-0 min-w-0 flex-1 overflow-y-auto">
          {(loading || waitingFresh) && (
            <div className="flex flex-col items-center justify-center gap-2 px-4 py-16 text-sm text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
              {loading ? 'Checking…' : "Getting the technician's current location…"}
            </div>
          )}

          {!loading && noRow && technicianId && (
            <div className="m-4 rounded-xl border border-dashed p-4 text-sm leading-relaxed text-muted-foreground">
              This technician hasn't opened the Android app yet — location sharing starts
              automatically the first time they do. They may be using the website instead.
            </div>
          )}

          {!loading && !waitingFresh && row && (
            <div className="min-w-0">
              <div className="space-y-2 px-4 py-3">
                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge
                    variant="outline"
                    className={cn(
                      'rounded-full px-2.5 py-0.5 text-[11px] font-medium',
                      row.is_tracking
                        ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                        : 'border-border bg-muted text-muted-foreground'
                    )}
                  >
                    {row.is_tracking ? 'Sharing on' : 'Sharing off'}
                  </Badge>
                  {exactFix && hasCoords && (
                    <Badge
                      variant="outline"
                      className="rounded-full border-sky-200 bg-sky-50 px-2.5 py-0.5 text-[11px] font-medium text-sky-700"
                    >
                      Exact location
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  <RelativeAgo iso={fixTimeOf(row)} />
                  {row.accuracy != null ? ` · ±${Math.round(row.accuracy)} m` : ''}
                </p>
              </div>

              {!row.is_tracking && (
                <p className="px-4 pb-3 text-xs leading-relaxed text-muted-foreground">
                  Location sharing is off in the app record — ask them to open the
                  HydrogenRO Tech APK (not the website), keep Location allowed for
                  the app, then force-close and reopen once. Showing the last known
                  location.
                </p>
              )}

              {timedOut && (
                <p className="px-4 pb-3 text-xs leading-relaxed text-amber-700">
                  Couldn't get the exact current location — showing the latest known
                  position
                  {hasCoords ? (
                    <>
                      {' '}
                      from <RelativeAgo iso={fixTimeOf(row)} />
                    </>
                  ) : null}
                  . Tap refresh to try again, or ask the technician to open the app.
                </p>
              )}

              {!timedOut && !exactFix && hasCoords && row.is_tracking && (
                <p className="flex items-center gap-1.5 px-4 pb-3 text-xs text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Approximate position — updating to the exact fix…
                </p>
              )}

              {!hasCoords && row.is_tracking && (
                <div className="mx-4 mb-3 rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
                  No location has been received from this technician's phone yet. Tap refresh
                  to request it again.
                </div>
              )}

              {hasCoords && (
                <LiveLocationMap latitude={row.latitude!} longitude={row.longitude!} />
              )}

              <div className="flex items-center gap-2 px-4 py-3">
                {hasCoords && (
                  <Button
                    size="sm"
                    className="h-10 min-w-0 flex-1"
                    onClick={() =>
                      window.open(
                        `https://maps.google.com/?q=${row.latitude},${row.longitude}`,
                        '_blank'
                      )
                    }
                  >
                    <ExternalLink className="h-4 w-4 shrink-0" />
                    Open in Maps
                  </Button>
                )}
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-10 w-10 shrink-0 rounded-full"
                  aria-label="Refresh location"
                  title="Refresh location"
                  onClick={() => technicianId && void startWatching(technicianId, true)}
                >
                  <RefreshCw className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default TechnicianLiveLocationDialog;
