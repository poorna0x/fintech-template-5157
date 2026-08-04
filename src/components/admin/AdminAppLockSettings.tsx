import { useCallback, useEffect, useState } from 'react';
import { Fingerprint } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { isNativeApp } from '@/lib/isNativeApp';
import { checkBiometricAvailable, isBiometricPluginPresent } from '@/lib/biometricNative';
import {
  ADMIN_LOCK_DELAY_PRESETS,
  type AdminLockDelayPreset,
  disableAdminBiometricLock,
  enableAdminBiometricLock,
  formatAdminLockDelayLabel,
  getAdminLockCustomMinutes,
  getAdminLockDelayMs,
  getAdminLockDelayPreset,
  isAdminBiometricLockEnabled,
  setAdminLockDelayMs,
  subscribeAdminBiometricLock,
} from '@/lib/adminBiometricLock';

/**
 * Settings → App lock (Admin APK only). Toggle + when to ask for fingerprint.
 */
export function AdminAppLockSettings() {
  const [visible, setVisible] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [saving, setSaving] = useState(false);
  const [available, setAvailable] = useState(false);
  const [preset, setPreset] = useState<AdminLockDelayPreset>('2m');
  const [customMinutes, setCustomMinutes] = useState('10');
  const [delayLabel, setDelayLabel] = useState(() => formatAdminLockDelayLabel());

  const syncDelayUi = useCallback(() => {
    setPreset(getAdminLockDelayPreset());
    setCustomMinutes(String(getAdminLockCustomMinutes()));
    setDelayLabel(formatAdminLockDelayLabel());
    setEnabled(isAdminBiometricLockEnabled());
  }, []);

  const refresh = useCallback(async () => {
    if (!isNativeApp() || !isBiometricPluginPresent()) {
      setVisible(false);
      return;
    }
    const avail = await checkBiometricAvailable();
    setAvailable(avail.available);
    setVisible(true);
    syncDelayUi();
  }, [syncDelayUi]);

  useEffect(() => {
    void refresh();
    return subscribeAdminBiometricLock(() => {
      syncDelayUi();
    });
  }, [refresh, syncDelayUi]);

  if (!visible) return null;

  async function onToggle(next: boolean) {
    if (saving) return;
    setSaving(true);
    try {
      if (next) {
        const result = await enableAdminBiometricLock();
        if (result === 'ok') {
          setEnabled(true);
          toast.success('App lock on');
        } else if (result === 'unavailable') {
          toast.error('No screen lock set up on this phone');
        } else if (result === 'canceled') {
          /* leave off */
        } else {
          toast.error('Could not enable app lock');
        }
      } else {
        const result = await disableAdminBiometricLock();
        if (result === 'ok') {
          setEnabled(false);
          toast.success('App lock off');
        } else if (result !== 'canceled') {
          toast.error('Could not turn off app lock');
        }
      }
    } finally {
      setSaving(false);
      syncDelayUi();
    }
  }

  function applyPreset(next: AdminLockDelayPreset) {
    setPreset(next);
    if (next === 'custom') {
      const mins = Math.min(120, Math.max(1, Number(customMinutes) || 10));
      setCustomMinutes(String(mins));
      setAdminLockDelayMs(mins * 60_000);
      toast.success(`Lock after ${mins} minutes`);
      return;
    }
    const found = ADMIN_LOCK_DELAY_PRESETS.find((p) => p.id === next);
    if (found?.ms != null) {
      setAdminLockDelayMs(found.ms);
      toast.success(
        found.ms === 0 ? 'Locks immediately when you leave' : `Lock ${found.label.toLowerCase()}`
      );
    }
  }

  function applyCustomMinutes(raw: string) {
    setCustomMinutes(raw);
    const mins = Math.min(120, Math.max(1, Math.round(Number(raw))));
    if (!Number.isFinite(mins) || String(mins) !== raw.trim()) return;
    setAdminLockDelayMs(mins * 60_000);
  }

  return (
    <Card id="section-app-lock" className="scroll-mt-24">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Fingerprint className="w-4 h-4 text-sky-700" />
          App lock
        </CardTitle>
        <CardDescription>
          Lock the Admin app after you leave. Choose immediately, 2 minutes,
          5 minutes, or a custom time.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-card px-3 py-2.5">
          <div className="min-w-0 space-y-0.5">
            <Label className="text-sm font-medium">App lock</Label>
            <p className="text-xs text-muted-foreground leading-snug">
              {available
                ? delayLabel
                : 'Set up a screen lock on this phone first.'}
            </p>
          </div>
          <Switch
            checked={enabled}
            disabled={saving || !available}
            onCheckedChange={(v) => void onToggle(v)}
          />
        </div>

        <div className="rounded-md border border-border bg-card px-3 py-2.5 space-y-2">
          <Label className="text-sm font-medium" htmlFor="app-lock-delay">
            Ask for unlock
          </Label>
          <Select
            value={preset}
            onValueChange={(v) => applyPreset(v as AdminLockDelayPreset)}
            disabled={!available || saving}
          >
            <SelectTrigger id="app-lock-delay" className="h-10">
              <SelectValue placeholder="When to lock" />
            </SelectTrigger>
            <SelectContent>
              {ADMIN_LOCK_DELAY_PRESETS.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {preset === 'custom' ? (
            <div className="flex items-center gap-2 pt-1">
              <Input
                type="number"
                min={1}
                max={120}
                inputMode="numeric"
                className="h-10 w-24"
                value={customMinutes}
                disabled={!available || saving}
                onChange={(e) => applyCustomMinutes(e.target.value)}
                onBlur={() => {
                  const mins = Math.min(
                    120,
                    Math.max(1, Math.round(Number(customMinutes)) || 1)
                  );
                  setCustomMinutes(String(mins));
                  setAdminLockDelayMs(mins * 60_000);
                }}
                aria-label="Custom minutes"
              />
              <span className="text-sm text-muted-foreground">minutes away</span>
            </div>
          ) : null}

          <p className="text-xs text-muted-foreground leading-snug">
            Current: {formatAdminLockDelayLabel(getAdminLockDelayMs())}.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
