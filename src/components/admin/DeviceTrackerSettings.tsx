import { useCallback, useEffect, useState } from 'react';
import { Smartphone, RefreshCw, Trash2, Bell, PhoneCall, ChevronDown, ChevronUp } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  ADMIN_PUSH_CATEGORIES,
  ADMIN_PUSH_LABELS,
  TECH_PUSH_CATEGORIES,
  TECH_PUSH_LABELS,
  countEnabledPrefs,
  type AdminPushCategory,
  type AdminPushPrefs,
  type TechPushCategory,
  type TechPushPrefs,
} from '@/lib/pushNotificationPrefs';
import {
  type AdminDeviceRow,
  type TechnicianDeviceRow,
  deleteAdminDevice,
  deleteTechnicianDevice,
  formatDeviceLastSeen,
  loadAdminDevices,
  loadTechnicianDevices,
  readDeviceTrackerCache,
  tokenSuffix,
  updateAdminDevice,
  updateTechnicianDevice,
  writeDeviceTrackerCache,
} from '@/lib/deviceTracker';
import { syncDevicePrefsToNative } from '@/lib/devicePrefs';
import { getThisAdminDeviceToken, updateCachedAdminCallAlerts } from '@/lib/adminPush';
import { getThisTechnicianDeviceToken, updateCachedTechnicianCallAlerts } from '@/lib/technicianPush';
import { syncDeviceCallPrefsPush } from '@/lib/syncDeviceCallPrefs';

type Tab = 'admin' | 'technician';

interface DeviceCardProps {
  kind: Tab;
  displayName: string;
  deviceModel: string | null;
  ownerLabel: string;
  token: string;
  updatedAt: string;
  pushEnabled: boolean;
  callAlertsEnabled: boolean;
  pushPrefs: AdminPushPrefs | TechPushPrefs;
  saving: boolean;
  onSaveName: (name: string) => void;
  onTogglePush: (enabled: boolean) => void;
  onToggleCallAlerts: (enabled: boolean) => void;
  onTogglePref: (key: string, enabled: boolean) => void;
  onRemove: () => void;
}

function DeviceCard({
  kind,
  displayName,
  deviceModel,
  ownerLabel,
  token,
  updatedAt,
  pushEnabled,
  callAlertsEnabled,
  pushPrefs,
  saving,
  onSaveName,
  onTogglePush,
  onToggleCallAlerts,
  onTogglePref,
  onRemove,
}: DeviceCardProps) {
  const [nameDraft, setNameDraft] = useState(displayName);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    setNameDraft(displayName);
  }, [displayName]);

  const categories = kind === 'admin' ? ADMIN_PUSH_CATEGORIES : TECH_PUSH_CATEGORIES;
  const labels = kind === 'admin' ? ADMIN_PUSH_LABELS : TECH_PUSH_LABELS;
  const enabledCount = countEnabledPrefs(pushPrefs as Record<string, boolean>);
  const totalCount = categories.length;

  return (
    <div className="p-4 rounded-lg border border-border dark:border-gray-700 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-2">
          <Input
            value={nameDraft}
            onChange={(e) => setNameDraft(e.target.value)}
            onBlur={() => {
              const trimmed = nameDraft.trim();
              if (trimmed && trimmed !== displayName) onSaveName(trimmed);
              else setNameDraft(displayName);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
            }}
            className="font-semibold text-base"
            disabled={saving}
            aria-label="Device name"
          />
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span>{ownerLabel}</span>
            {deviceModel ? (
              <>
                <span>·</span>
                <span>{deviceModel}</span>
              </>
            ) : null}
            <span>·</span>
            <span>{tokenSuffix(token)}</span>
            <span>·</span>
            <span>Last seen {formatDeviceLastSeen(updatedAt)}</span>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          {!pushEnabled ? (
            <Badge variant="outline" className="text-[10px] text-amber-800 border-amber-300">
              All push off
            </Badge>
          ) : enabledCount < totalCount ? (
            <Badge variant="outline" className="text-[10px]">
              {enabledCount}/{totalCount} types on
            </Badge>
          ) : null}
          {!callAlertsEnabled ? (
            <Badge variant="outline" className="text-[10px] text-muted-foreground">
              Call detect off
            </Badge>
          ) : null}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:text-red-400 h-8 w-8 p-0"
            onClick={onRemove}
            disabled={saving}
            aria-label="Remove device"
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-card px-3 py-2.5">
          <div className="min-w-0 space-y-0.5">
            <Label className="text-sm font-medium flex items-center gap-1.5">
              <Bell className="w-3.5 h-3.5" />
              All push notifications
            </Label>
            <p className="text-xs text-muted-foreground leading-snug">
              Master switch — turns off every push type on this phone.
            </p>
          </div>
          <Switch checked={pushEnabled} disabled={saving} onCheckedChange={onTogglePush} />
        </div>

        <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-card px-3 py-2.5">
          <div className="min-w-0 space-y-0.5">
            <Label className="text-sm font-medium flex items-center gap-1.5">
              <PhoneCall className="w-3.5 h-3.5" />
              Detect calls on this phone
            </Label>
            <p className="text-xs text-muted-foreground leading-snug">
              {kind === 'admin'
                ? 'Whether this phone listens for rings (publish to shared search + report missed). Does not stop receiving call pushes — use “Customer call alerts” / “Wrong company-line calls” below for that.'
                : 'Whether this phone reports customer rings and wrong-line outbound calls to admins. Off = this handset stops both detections.'}
            </p>
          </div>
          <Switch
            checked={callAlertsEnabled}
            disabled={saving}
            onCheckedChange={onToggleCallAlerts}
          />
        </div>
      </div>

      <div className="rounded-md border border-border">
        <button
          type="button"
          className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left hover:bg-muted/40 transition-colors"
          onClick={() => setExpanded((v) => !v)}
        >
          <span className="text-sm font-medium">
            Notification types for this phone
            <span className="ml-1.5 font-normal text-muted-foreground">
              (WhatsApp, jobs, calls, reminders…)
            </span>
          </span>
          {expanded ? <ChevronUp className="w-4 h-4 shrink-0" /> : <ChevronDown className="w-4 h-4 shrink-0" />}
        </button>
        {expanded ? (
          <div className="border-t border-border divide-y divide-border">
            {categories.map((key) => {
              const meta = labels[key as AdminPushCategory & TechPushCategory];
              const checked = (pushPrefs as Record<string, boolean>)[key] !== false;
              return (
                <div
                  key={key}
                  className="flex items-center justify-between gap-3 px-3 py-2.5 bg-card/50"
                >
                  <div className="min-w-0 space-y-0.5">
                    <p className="text-sm font-medium">{meta.label}</p>
                    <p className="text-xs text-muted-foreground leading-snug">{meta.description}</p>
                  </div>
                  <Switch
                    checked={checked}
                    disabled={saving || !pushEnabled}
                    onCheckedChange={(enabled) => onTogglePref(key, enabled)}
                  />
                </div>
              );
            })}
          </div>
        ) : null}
      </div>
    </div>
  );
}

/** Settings section — manage admin & technician phones and per-type push controls. */
export function DeviceTrackerSettings() {
  const [sectionOpen, setSectionOpen] = useState(false);
  const [tab, setTab] = useState<Tab>('admin');
  const [loading, setLoading] = useState(false);
  const [adminDevices, setAdminDevices] = useState<AdminDeviceRow[]>(() => readDeviceTrackerCache()?.adminDevices ?? []);
  const [techDevices, setTechDevices] = useState<TechnicianDeviceRow[]>(() => readDeviceTrackerCache()?.techDevices ?? []);
  const [savingToken, setSavingToken] = useState<string | null>(null);
  const [removeTarget, setRemoveTarget] = useState<{ kind: Tab; token: string; name: string } | null>(
    null
  );

  const applyDevices = useCallback((admins: AdminDeviceRow[], techs: TechnicianDeviceRow[]) => {
    setAdminDevices(admins);
    setTechDevices(techs);
    writeDeviceTrackerCache(admins, techs);
  }, []);

  const refresh = useCallback(async (opts?: { force?: boolean }) => {
    const cached = readDeviceTrackerCache();
    if (!opts?.force && cached) {
      setAdminDevices(cached.adminDevices);
      setTechDevices(cached.techDevices);
      return;
    }

    setLoading(true);
    try {
      const [admins, techs] = await Promise.all([loadAdminDevices(), loadTechnicianDevices()]);
      applyDevices(admins, techs);
    } catch (err) {
      console.error('[device-tracker] load failed', err);
      if (!cached) {
        toast.error('Could not load devices. Run scripts/add-device-tracker.sql in Supabase if this is new.');
      } else {
        toast.error('Refresh failed — showing cached list');
      }
    } finally {
      setLoading(false);
    }
  }, [applyDevices]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const patchAdmin = async (
    token: string,
    patch: Parameters<typeof updateAdminDevice>[1],
    label: string
  ) => {
    setSavingToken(token);
    try {
      await updateAdminDevice(token, patch);
      setAdminDevices((prev) => {
        const next = prev.map((d) =>
          d.token === token ? { ...d, ...patch, updated_at: new Date().toISOString() } : d
        );
        setTechDevices((techPrev) => {
          writeDeviceTrackerCache(next, techPrev);
          return techPrev;
        });
        return next;
      });
      if (typeof patch.call_alerts_enabled === 'boolean') {
        const thisToken = getThisAdminDeviceToken();
        if (thisToken && thisToken === token) {
          updateCachedAdminCallAlerts(patch.call_alerts_enabled);
          await syncDevicePrefsToNative({ callAlertsEnabled: patch.call_alerts_enabled });
        }
        // Silent FCM so the target phone updates native prefs without opening the app.
        void syncDeviceCallPrefsPush({
          token,
          kind: 'admin',
          callAlertsEnabled: patch.call_alerts_enabled,
        }).catch(() => {});
      }
      toast.success(label);
    } catch (err) {
      console.error('[device-tracker] admin update', err);
      toast.error('Update failed');
      void refresh();
    } finally {
      setSavingToken(null);
    }
  };

  const patchTech = async (
    token: string,
    patch: Parameters<typeof updateTechnicianDevice>[1],
    label: string
  ) => {
    setSavingToken(token);
    try {
      await updateTechnicianDevice(token, patch);
      setTechDevices((prev) => {
        const next = prev.map((d) =>
          d.token === token ? { ...d, ...patch, updated_at: new Date().toISOString() } : d
        );
        setAdminDevices((adminPrev) => {
          writeDeviceTrackerCache(adminPrev, next);
          return adminPrev;
        });
        return next;
      });
      if (typeof patch.push_enabled === 'boolean') {
        const thisToken = getThisTechnicianDeviceToken();
        if (thisToken && thisToken === token) {
          await syncDevicePrefsToNative({ pushEnabled: patch.push_enabled });
        }
        void syncDeviceCallPrefsPush({
          token,
          kind: 'technician',
          pushEnabled: patch.push_enabled,
        }).catch(() => {});
      }
      if (typeof patch.call_alerts_enabled === 'boolean') {
        const thisToken = getThisTechnicianDeviceToken();
        if (thisToken && thisToken === token) {
          updateCachedTechnicianCallAlerts(patch.call_alerts_enabled);
          await syncDevicePrefsToNative({ callAlertsEnabled: patch.call_alerts_enabled });
        }
        void syncDeviceCallPrefsPush({
          token,
          kind: 'technician',
          callAlertsEnabled: patch.call_alerts_enabled,
        }).catch(() => {});
      }
      if (patch.push_prefs && typeof (patch.push_prefs as { wrong_line?: boolean }).wrong_line === 'boolean') {
        const wrongOn = (patch.push_prefs as { wrong_line: boolean }).wrong_line !== false;
        const thisToken = getThisTechnicianDeviceToken();
        if (thisToken && thisToken === token) {
          await syncDevicePrefsToNative({ wrongLineReminderEnabled: wrongOn });
        }
        void syncDeviceCallPrefsPush({
          token,
          kind: 'technician',
          wrongLineReminderEnabled: wrongOn,
        }).catch(() => {});
      }
      toast.success(label);
    } catch (err) {
      console.error('[device-tracker] tech update', err);
      toast.error('Update failed');
      void refresh();
    } finally {
      setSavingToken(null);
    }
  };

  const confirmRemove = async () => {
    if (!removeTarget) return;
    setSavingToken(removeTarget.token);
    try {
      if (removeTarget.kind === 'admin') {
        await deleteAdminDevice(removeTarget.token);
        setAdminDevices((prev) => {
          const next = prev.filter((d) => d.token !== removeTarget.token);
          setTechDevices((techPrev) => {
            writeDeviceTrackerCache(next, techPrev);
            return techPrev;
          });
          return next;
        });
      } else {
        await deleteTechnicianDevice(removeTarget.token);
        setTechDevices((prev) => {
          const next = prev.filter((d) => d.token !== removeTarget.token);
          setAdminDevices((adminPrev) => {
            writeDeviceTrackerCache(adminPrev, next);
            return adminPrev;
          });
          return next;
        });
      }
      toast.success('Device removed — it will stop receiving pushes until the app opens again.');
    } catch (err) {
      console.error('[device-tracker] remove', err);
      toast.error('Could not remove device');
    } finally {
      setSavingToken(null);
      setRemoveTarget(null);
    }
  };

  const devices = tab === 'admin' ? adminDevices : techDevices;
  const isSaving = (token: string) => savingToken === token;

  return (
    <>
      <Card id="section-device-tracker" className="scroll-mt-24">
        <CardHeader className="space-y-0 p-0">
          <div className="flex w-full flex-col sm:flex-row sm:items-center sm:justify-between gap-4 p-6">
            <button
              type="button"
              className="min-w-0 flex-1 text-left hover:opacity-90 transition-opacity rounded-md"
              onClick={() => setSectionOpen((v) => !v)}
              aria-expanded={sectionOpen}
            >
              <CardTitle className="flex items-center gap-2 text-lg sm:text-xl">
                <Smartphone className="w-5 h-5" />
                Device Tracker
                {sectionOpen ? (
                  <ChevronUp className="w-4 h-4 text-muted-foreground" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-muted-foreground" />
                )}
              </CardTitle>
              <CardDescription className="text-sm mt-1">
                {sectionOpen
                  ? 'Every admin and technician phone — rename, mute all push, or turn individual types on/off (WhatsApp inbox, job status, calls, cash check, etc.). List is cached for this session; tap Refresh when someone registers a new phone.'
                  : 'Admin and technician phones — push types, WhatsApp, calls. Tap to open.'}
              </CardDescription>
            </button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="shrink-0 self-start sm:self-center"
              onClick={() => {
                if (!sectionOpen) setSectionOpen(true);
                void refresh({ force: true });
              }}
              disabled={loading}
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </CardHeader>
        {sectionOpen ? (
        <CardContent className="p-4 sm:p-6 space-y-4 border-t border-border">
          <div className="flex gap-2 p-1 rounded-lg bg-muted/50 w-full sm:w-auto">
            <Button
              type="button"
              variant={tab === 'admin' ? 'default' : 'ghost'}
              size="sm"
              className="flex-1 sm:flex-none"
              onClick={() => setTab('admin')}
            >
              Admin phones ({adminDevices.length})
            </Button>
            <Button
              type="button"
              variant={tab === 'technician' ? 'default' : 'ghost'}
              size="sm"
              className="flex-1 sm:flex-none"
              onClick={() => setTab('technician')}
            >
              Technician phones ({techDevices.length})
            </Button>
          </div>

          {loading && adminDevices.length === 0 && techDevices.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground text-sm">Loading devices…</div>
          ) : devices.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground text-sm">
              {tab === 'admin'
                ? 'No admin phones registered yet. Open the HRO Admin app on a phone and allow notifications.'
                : 'No technician phones registered yet. Technicians need to open the HRO Technician app while logged in.'}
            </div>
          ) : tab === 'admin' ? (
            <div className="space-y-4">
              {adminDevices.map((device) => (
                <DeviceCard
                  key={device.token}
                  kind="admin"
                  displayName={device.display_name || 'Admin phone'}
                  deviceModel={device.device_model}
                  ownerLabel={device.ownerLabel || 'Admin'}
                  token={device.token}
                  updatedAt={device.updated_at}
                  pushEnabled={device.push_enabled}
                  callAlertsEnabled={device.call_alerts_enabled}
                  pushPrefs={device.push_prefs}
                  saving={isSaving(device.token)}
                  onSaveName={(name) => void patchAdmin(device.token, { display_name: name }, 'Name saved')}
                  onTogglePush={(enabled) =>
                    void patchAdmin(
                      device.token,
                      { push_enabled: enabled },
                      enabled ? 'Push enabled' : 'All push muted on this phone'
                    )
                  }
                  onToggleCallAlerts={(enabled) =>
                    void patchAdmin(
                      device.token,
                      { call_alerts_enabled: enabled },
                      enabled
                        ? 'This phone will detect calls'
                        : 'Call detection off on this phone'
                    )
                  }
                  onTogglePref={(key, enabled) =>
                    void patchAdmin(
                      device.token,
                      { push_prefs: { ...device.push_prefs, [key]: enabled } },
                      'Notification preference saved'
                    )
                  }
                  onRemove={() =>
                    setRemoveTarget({
                      kind: 'admin',
                      token: device.token,
                      name: device.display_name || 'Admin phone',
                    })
                  }
                />
              ))}
            </div>
          ) : (
            <div className="space-y-4">
              {techDevices.map((device) => (
                <DeviceCard
                  key={device.token}
                  kind="technician"
                  displayName={device.display_name || 'Technician phone'}
                  deviceModel={device.device_model}
                  ownerLabel={device.ownerLabel || 'Technician'}
                  token={device.token}
                  updatedAt={device.updated_at}
                  pushEnabled={device.push_enabled}
                  callAlertsEnabled={device.call_alerts_enabled}
                  pushPrefs={device.push_prefs}
                  saving={isSaving(device.token)}
                  onSaveName={(name) => void patchTech(device.token, { display_name: name }, 'Name saved')}
                  onTogglePush={(enabled) =>
                    void patchTech(
                      device.token,
                      { push_enabled: enabled },
                      enabled ? 'Push enabled' : 'All push muted on this phone'
                    )
                  }
                  onToggleCallAlerts={(enabled) =>
                    void patchTech(
                      device.token,
                      { call_alerts_enabled: enabled },
                      enabled
                        ? 'This phone will report customer rings to admins'
                        : 'Call detection off on this phone'
                    )
                  }
                  onTogglePref={(key, enabled) =>
                    void patchTech(
                      device.token,
                      { push_prefs: { ...device.push_prefs, [key]: enabled } },
                      key === 'wrong_line'
                        ? enabled
                          ? 'Wrong-line alerts on for this phone (tech + admins)'
                          : 'Wrong-line alerts off — this phone will not report to admins'
                        : 'Notification preference saved'
                    )
                  }
                  onRemove={() =>
                    setRemoveTarget({
                      kind: 'technician',
                      token: device.token,
                      name: device.display_name || 'Technician phone',
                    })
                  }
                />
              ))}
            </div>
          )}
        </CardContent>
        ) : null}
      </Card>

      <AlertDialog open={Boolean(removeTarget)} onOpenChange={(open) => !open && setRemoveTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {removeTarget?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This deletes the device token from the server. The phone stops receiving pushes until someone opens the app again and re-registers.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() => void confirmRemove()}
            >
              Remove device
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
