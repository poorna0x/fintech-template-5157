import { useCallback, useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import DraggableMap from '@/components/DraggableMap';
import { resolveSupabaseAccessTokenForApi } from '@/lib/ensureSupabaseSession';
import {
  extractMapsUrlFromText,
  resolveGoogleMapsInputToCoords,
} from '@/lib/googleMapsLink';
import {
  applyWhatsAppLocationToCustomer,
  parseLatLngFromWhatsAppLocationBody,
} from '@/lib/whatsappInboxApplyToCustomer';
import type { WhatsAppMessageRow } from '@/lib/whatsappInbox';

const BANGALORE = { lat: 12.9716, lng: 77.5946 };
const RESOLVE_MS = 8000;
const OPENING_TOAST_ID = 'wa-inbox-location';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  message: WhatsAppMessageRow;
  customerId?: string | null;
};

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return new Promise((resolve) => {
    const timer = window.setTimeout(() => resolve(null), ms);
    void promise.then(
      (value) => {
        window.clearTimeout(timer);
        resolve(value);
      },
      () => {
        window.clearTimeout(timer);
        resolve(null);
      }
    );
  });
}

export function WhatsAppInboxLocationDialog({
  open,
  onOpenChange,
  message,
  customerId,
}: Props) {
  const [finding, setFinding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [center, setCenter] = useState(BANGALORE);

  useEffect(() => {
    if (!open) return;
    toast.dismiss(OPENING_TOAST_ID);

    let cancelled = false;
    const body = String(message.body || '');
    const pin = parseLatLngFromWhatsAppLocationBody(body);
    const mapsUrl = extractMapsUrlFromText(body);

    if (pin && !mapsUrl) {
      setCenter({ lat: pin.lat, lng: pin.lng });
      setFinding(false);
      return;
    }

    setFinding(true);
    if (pin) setCenter({ lat: pin.lat, lng: pin.lng });
    else setCenter(BANGALORE);

    void (async () => {
      const token = await resolveSupabaseAccessTokenForApi();
      const resolved = await withTimeout(
        resolveGoogleMapsInputToCoords(body || mapsUrl || '', {
          shareText: body,
          accessToken: token,
        }),
        RESOLVE_MS
      );
      if (cancelled) return;
      if (resolved?.ok) {
        setCenter({
          lat: resolved.coords.latitude,
          lng: resolved.coords.longitude,
        });
      } else if (!pin) {
        setCenter(BANGALORE);
        toast.message('Couldn’t read the Maps link — drag the pin to the right place');
      }
      setFinding(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [open, message.id, message.body]);

  const onLocationChange = useCallback((location: { lat: number; lng: number }) => {
    setCenter(location);
  }, []);

  const save = async () => {
    setSaving(true);
    toast.loading('Saving location…', { id: 'wa-inbox-location-save' });
    try {
      const result = await applyWhatsAppLocationToCustomer({
        messageId: message.id,
        customerId,
        body: message.body,
        latitude: center.lat,
        longitude: center.lng,
      });
      if (!result.ok) {
        toast.error(result.error || 'Could not update customer', {
          id: 'wa-inbox-location-save',
        });
        return;
      }
      toast.success(result.address ? `Location saved: ${result.address}` : 'Customer location updated', {
        id: 'wa-inbox-location-save',
      });
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        overlayClassName="z-[220]"
        className="z-[221] max-w-[calc(100vw-1.5rem)] gap-3 sm:max-w-lg"
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <DialogHeader>
          <DialogTitle>Update customer location</DialogTitle>
          <DialogDescription>
            Drag the pin to the exact spot, then save.
          </DialogDescription>
        </DialogHeader>
        <div className="relative min-h-[240px] overflow-hidden rounded-lg">
          {finding ? (
            <div className="flex h-[240px] flex-col items-center justify-center gap-2 rounded-lg bg-muted sm:h-[320px]">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              <p className="text-sm font-medium text-foreground">Finding this place…</p>
            </div>
          ) : (
            <DraggableMap
              key={message.id}
              center={center}
              onLocationChange={onLocationChange}
              zoom={17}
              height="320px"
            />
          )}
        </div>
        <p className="text-center text-[12px] tabular-nums text-muted-foreground">
          {center.lat.toFixed(6)}, {center.lng.toFixed(6)}
        </p>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            className="bg-[#00a884] text-white hover:bg-[#008f72]"
            disabled={saving}
            onClick={() => void save()}
          >
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {saving ? 'Saving…' : 'Save location'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
