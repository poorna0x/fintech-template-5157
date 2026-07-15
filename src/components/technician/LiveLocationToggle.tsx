import { useEffect, useState } from 'react';
import { MapPin } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
  isNativeApp,
  isLiveTrackingActive,
  startLiveTracking,
  stopLiveTracking,
} from '@/lib/technicianLiveLocation';

const STORAGE_KEY = 'tech-live-tracking-on';

/**
 * "Share live location" switch for technicians. Renders nothing on the
 * website/PWA — only inside the Capacitor Android app where background
 * geolocation is available.
 */
const LiveLocationToggle = ({ technicianId }: { technicianId: string }) => {
  const [on, setOn] = useState(isLiveTrackingActive);
  const [busy, setBusy] = useState(false);

  // Resume tracking after app restart if it was on last time.
  useEffect(() => {
    if (!isNativeApp() || isLiveTrackingActive()) return;
    if (localStorage.getItem(STORAGE_KEY) !== '1') return;
    void startLiveTracking(technicianId).then((ok) => setOn(ok));
  }, [technicianId]);

  if (!isNativeApp()) return null;

  const handleChange = async (next: boolean) => {
    setBusy(true);
    try {
      if (next) {
        const ok = await startLiveTracking(technicianId);
        setOn(ok);
        localStorage.setItem(STORAGE_KEY, ok ? '1' : '0');
        if (ok) toast.success('Live location sharing is on');
        else toast.error('Could not start location sharing. Check location permission.');
      } else {
        await stopLiveTracking(technicianId);
        setOn(false);
        localStorage.setItem(STORAGE_KEY, '0');
        toast.success('Live location sharing is off');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border bg-card px-3 py-2">
      <div className="flex items-start gap-2 text-sm">
        <MapPin
          className={cn('mt-0.5 h-4 w-4 shrink-0', on ? 'text-green-600' : 'text-muted-foreground')}
        />
        <div>
          <span className="font-medium">Share live location</span>
          <p className="text-xs text-muted-foreground">
            Sent only while the office is viewing it.
          </p>
        </div>
      </div>
      <Switch checked={on} disabled={busy} onCheckedChange={handleChange} />
    </div>
  );
};

export default LiveLocationToggle;
