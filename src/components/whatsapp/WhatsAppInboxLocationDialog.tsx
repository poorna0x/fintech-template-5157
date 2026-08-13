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

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  message: WhatsAppMessageRow;
  customerId?: string | null;
};

export function WhatsAppInboxLocationDialog({
  open,
  onOpenChange,
  message,
  customerId,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [center, setCenter] = useState(BANGALORE);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);

    void (async () => {
      const body = String(message.body || '');
      const pin = parseLatLngFromWhatsAppLocationBody(body);
      const mapsUrl = extractMapsUrlFromText(body);

      if (pin && !mapsUrl) {
        if (!cancelled) {
          setCenter({ lat: pin.lat, lng: pin.lng });
          setLoading(false);
        }
        return;
      }

      const token = await resolveSupabaseAccessTokenForApi();
      const toResolve = body || mapsUrl || '';
      const resolved = await resolveGoogleMapsInputToCoords(toResolve, {
        shareText: body,
        accessToken: token,
      });
      if (cancelled) return;
      if (resolved.ok) {
        setCenter({
          lat: resolved.coords.latitude,
          lng: resolved.coords.longitude,
        });
      } else if (pin) {
        setCenter({ lat: pin.lat, lng: pin.lng });
      } else {
        setCenter(BANGALORE);
        toast.message('Couldn’t read the Maps link — drag the pin to the right place');
      }
      setLoading(false);
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
    try {
      const result = await applyWhatsAppLocationToCustomer({
        messageId: message.id,
        customerId,
        body: message.body,
        latitude: center.lat,
        longitude: center.lng,
      });
      if (!result.ok) {
        toast.error(result.error || 'Could not update customer');
        return;
      }
      toast.success(result.address ? `Location saved: ${result.address}` : 'Customer location updated');
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-[calc(100vw-1.5rem)] gap-3 sm:max-w-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <DialogHeader>
          <DialogTitle>Update customer location</DialogTitle>
          <DialogDescription>
            Drag the pin to the exact spot, then save.
          </DialogDescription>
        </DialogHeader>
        <div className="relative min-h-[240px] overflow-hidden rounded-lg">
          {loading ? (
            <div className="flex h-[240px] items-center justify-center rounded-lg bg-muted sm:h-[320px]">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <DraggableMap
              center={center}
              onLocationChange={onLocationChange}
              zoom={17}
              height="min(50vh, 320px)"
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
            disabled={loading || saving}
            onClick={() => void save()}
          >
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Save location
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
