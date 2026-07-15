import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
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

type LiveLocationRow = {
  technician_id: string;
  latitude: number | null;
  longitude: number | null;
  accuracy: number | null;
  is_tracking: boolean;
  updated_at: string;
};

type TechnicianLiveLocationDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  technicians: Technician[];
};

function agoLabel(iso: string): string {
  const secs = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ${mins % 60}m ago`;
  return new Date(iso).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
}

const TechnicianLiveLocationDialog = ({
  open,
  onOpenChange,
  technicians,
}: TechnicianLiveLocationDialogProps) => {
  const [technicianId, setTechnicianId] = useState<string>('');
  const [row, setRow] = useState<LiveLocationRow | null>(null);
  const [loading, setLoading] = useState(false);
  const [noRow, setNoRow] = useState(false);
  // Ticks every 5s so the "updated Xs ago" label stays fresh.
  const [, setNowTick] = useState(0);

  const channelRef = useRef<RealtimeChannel | null>(null);

  const sendPing = useCallback(async (techId: string) => {
    // DB stamp: picked up over realtime when the app is awake.
    await supabase
      .from('technician_live_locations')
      .update({ ping_requested_at: new Date().toISOString() })
      .eq('technician_id', techId);

    // FCM push: wakes the app even when Android froze it in the background.
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
      // Push is best-effort; the realtime ping still works while the app is awake.
    }
  }, []);

  const cleanup = useCallback(() => {
    if (channelRef.current) {
      void supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }
  }, []);

  const startWatching = useCallback(
    async (techId: string) => {
      cleanup();
      setLoading(true);
      setRow(null);
      setNoRow(false);

      const { data } = await supabase
        .from('technician_live_locations')
        .select('technician_id,latitude,longitude,accuracy,is_tracking,updated_at')
        .eq('technician_id', techId)
        .maybeSingle();

      setLoading(false);
      if (!data) {
        setNoRow(true);
        return;
      }
      setRow(data as LiveLocationRow);

      // One request: the app sends its current location once and stops.
      void sendPing(techId);

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
            if (next) setRow(next);
          }
        )
        .subscribe();
    },
    [cleanup, sendPing]
  );

  useEffect(() => {
    if (!open) {
      cleanup();
      setRow(null);
      setNoRow(false);
      return;
    }
    if (technicianId) void startWatching(technicianId);
    return cleanup;
  }, [open, technicianId, startWatching, cleanup]);

  useEffect(() => {
    if (!open) return;
    const t = setInterval(() => setNowTick((n) => n + 1), 5_000);
    return () => clearInterval(t);
  }, [open]);

  const activeTechs = technicians.filter((t) => (t as any).isActive !== false);
  const hasCoords = row != null && row.latitude != null && row.longitude != null;
  const mapSrc = hasCoords
    ? `https://maps.google.com/maps?q=${row.latitude},${row.longitude}&z=16&output=embed`
    : null;
  // Sharing is on but nothing fresh in the last 2 min — the app is probably asleep.
  const looksAsleep =
    row != null &&
    row.is_tracking &&
    Date.now() - new Date(row.updated_at).getTime() > 120_000;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader className="pr-12">
          <DialogTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5" />
            Technician location
          </DialogTitle>
          <DialogDescription>
            The technician's phone sends its current location once when you open this or tap
            Refresh.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Technician</Label>
            <Select value={technicianId} onValueChange={setTechnicianId}>
              <SelectTrigger>
                <SelectValue placeholder="Select technician" />
              </SelectTrigger>
              <SelectContent>
                {activeTechs.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.fullName || (t as any).full_name || 'Technician'}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {loading && (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Checking…
            </div>
          )}

          {!loading && noRow && technicianId && (
            <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
              This technician hasn't turned on location sharing in the app yet, or they're
              using the website instead of the Android app.
            </div>
          )}

          {!loading && row && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <Badge
                  variant="outline"
                  className={cn(
                    row.is_tracking
                      ? 'border-green-300 bg-green-50 text-green-700'
                      : 'border-gray-300 bg-gray-50 text-gray-600'
                  )}
                >
                  {row.is_tracking ? 'Sharing on' : 'Sharing off'}
                </Badge>
                <span className="text-muted-foreground">
                  Updated {agoLabel(row.updated_at)}
                  {row.accuracy != null ? ` · ±${Math.round(row.accuracy)} m` : ''}
                </span>
              </div>

              {!row.is_tracking && (
                <p className="text-xs text-muted-foreground">
                  Showing the last known location from before sharing was turned off.
                </p>
              )}

              {looksAsleep && (
                <p className="text-xs text-amber-700">
                  Waiting for the technician's phone to send a fresh location… If this doesn't
                  update in a minute, their phone has paused the app — tap Refresh or try again
                  after they open the app.
                </p>
              )}

              {!hasCoords && row.is_tracking && (
                <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                  Sharing is on but no location has been received yet. It will appear here
                  automatically once the phone responds.
                </div>
              )}

              {mapSrc && (
                <div className="overflow-hidden rounded-lg border">
                  <iframe
                    title="Technician location map"
                    src={mapSrc}
                    className="h-64 w-full sm:h-80"
                    loading="lazy"
                    referrerPolicy="no-referrer-when-downgrade"
                  />
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                {hasCoords && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      window.open(
                        `https://maps.google.com/?q=${row.latitude},${row.longitude}`,
                        '_blank'
                      )
                    }
                  >
                    <ExternalLink className="mr-2 h-4 w-4" />
                    Open in Google Maps
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => technicianId && void startWatching(technicianId)}
                >
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Refresh
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
