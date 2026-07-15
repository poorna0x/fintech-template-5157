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
  latitude: number;
  longitude: number;
  accuracy: number | null;
  is_tracking: boolean;
  updated_at: string;
};

type TechnicianLiveLocationDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  technicians: Technician[];
};

/** Re-stamp ping_requested_at while the dialog is open so the app keeps uploading. */
const PING_INTERVAL_MS = 25_000;

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
  const pingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const sendPing = useCallback(async (techId: string) => {
    await supabase
      .from('technician_live_locations')
      .update({ ping_requested_at: new Date().toISOString() })
      .eq('technician_id', techId);
  }, []);

  const cleanup = useCallback(() => {
    if (pingTimerRef.current) {
      clearInterval(pingTimerRef.current);
      pingTimerRef.current = null;
    }
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

      // Ask the app to start uploading, and repeat while the dialog stays open.
      void sendPing(techId);
      pingTimerRef.current = setInterval(() => void sendPing(techId), PING_INTERVAL_MS);

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
            if (next?.latitude != null) setRow(next);
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
  const mapSrc = row
    ? `https://maps.google.com/maps?q=${row.latitude},${row.longitude}&z=16&output=embed`
    : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader className="pr-12">
          <DialogTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5" />
            Technician live location
          </DialogTitle>
          <DialogDescription>
            Location is fetched from the technician's app only while this window is open.
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
