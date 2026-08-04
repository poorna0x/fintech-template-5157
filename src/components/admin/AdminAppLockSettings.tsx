import { useCallback, useEffect, useState } from 'react';
import { Fingerprint } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { isNativeApp } from '@/lib/isNativeApp';
import { checkBiometricAvailable, isBiometricPluginPresent } from '@/lib/biometricNative';
import {
  disableAdminBiometricLock,
  enableAdminBiometricLock,
  isAdminBiometricLockEnabled,
  subscribeAdminBiometricLock,
} from '@/lib/adminBiometricLock';

/**
 * Settings → App lock (Admin APK only). Toggle fingerprint unlock on this phone.
 */
export function AdminAppLockSettings() {
  const [visible, setVisible] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [saving, setSaving] = useState(false);
  const [available, setAvailable] = useState(false);

  const refresh = useCallback(async () => {
    if (!isNativeApp() || !isBiometricPluginPresent()) {
      setVisible(false);
      return;
    }
    const avail = await checkBiometricAvailable();
    setAvailable(avail.available);
    setVisible(true);
    setEnabled(isAdminBiometricLockEnabled());
  }, []);

  useEffect(() => {
    void refresh();
    return subscribeAdminBiometricLock(() => {
      setEnabled(isAdminBiometricLockEnabled());
    });
  }, [refresh]);

  if (!visible) return null;

  async function onToggle(next: boolean) {
    if (saving) return;
    setSaving(true);
    try {
      if (next) {
        const result = await enableAdminBiometricLock();
        if (result === 'ok') {
          setEnabled(true);
          toast.success('Fingerprint lock on');
        } else if (result === 'unavailable') {
          toast.error('No fingerprint or screen lock set up on this phone');
        } else if (result === 'canceled') {
          /* leave off */
        } else {
          toast.error('Could not enable fingerprint lock');
        }
      } else {
        const result = await disableAdminBiometricLock();
        if (result === 'ok') {
          setEnabled(false);
          toast.success('Fingerprint lock off');
        } else if (result !== 'canceled') {
          toast.error('Could not turn off fingerprint lock');
        }
      }
    } finally {
      setSaving(false);
      setEnabled(isAdminBiometricLockEnabled());
    }
  }

  return (
    <Card id="section-app-lock" className="scroll-mt-24">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Fingerprint className="w-4 h-4 text-sky-700" />
          App lock
        </CardTitle>
        <CardDescription>
          Require fingerprint (or phone PIN) after the app has been closed for
          2 minutes. Quick switches stay unlocked. Push taps still open the
          right screen after you unlock.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-card px-3 py-2.5">
          <div className="min-w-0 space-y-0.5">
            <Label className="text-sm font-medium">Fingerprint unlock</Label>
            <p className="text-xs text-muted-foreground leading-snug">
              {available
                ? 'Asked only if the app was closed for 2+ minutes.'
                : 'Set up a fingerprint or screen lock in Android Settings first.'}
            </p>
          </div>
          <Switch
            checked={enabled}
            disabled={saving || !available}
            onCheckedChange={(v) => void onToggle(v)}
          />
        </div>
      </CardContent>
    </Card>
  );
}
