import { useEffect, useState } from 'react';
import { Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { SettingsActionCard } from '@/components/admin/SettingsActionCard';
import { EmailSentLogDialog } from '@/components/admin/EmailSentLogDialog';
import { db } from '@/lib/supabase';
import { toast } from 'sonner';

/** Settings — sent email log + open-tracking toggle (pixel via Hostinger SMTP). */
export function EmailTrackingSettings() {
  const [logOpen, setLogOpen] = useState(false);
  const [trackingEnabled, setTrackingEnabled] = useState(true);
  const [trackingLoading, setTrackingLoading] = useState(true);
  const [trackingSaving, setTrackingSaving] = useState(false);
  const [settingsMissing, setSettingsMissing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setTrackingLoading(true);
    void db.crmSettings.getEmailOpenTrackingEnabled().then(({ enabled, error }) => {
      if (cancelled) return;
      setTrackingLoading(false);
      if (error) {
        if (/crm_settings|could not find the table|schema cache/i.test(error.message || '')) {
          setSettingsMissing(true);
        }
        return;
      }
      setTrackingEnabled(enabled);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleTrackingToggle = async (checked: boolean) => {
    setTrackingSaving(true);
    const prev = trackingEnabled;
    setTrackingEnabled(checked);
    const { error } = await db.crmSettings.setEmailOpenTrackingEnabled(checked);
    setTrackingSaving(false);
    if (error) {
      setTrackingEnabled(prev);
      toast.error(error.message || 'Could not save setting');
      return;
    }
    toast.success(checked ? 'Open tracking enabled for new emails' : 'Open tracking disabled for new emails');
  };

  return (
    <>
      <div id="section-email-tracking" className="space-y-4">
        <SettingsActionCard
          title="Sent email log"
          description="Track every email sent from the CRM (completion, AMC, booking, admin composer). Uses a small tracking pixel on Hostinger SMTP — open status is approximate if images are blocked."
          icon={<Mail />}
          actions={
            <Button
              type="button"
              variant="outline"
              className="w-full sm:w-auto touch-manipulation gap-2 h-11 sm:h-9"
              onClick={() => setLogOpen(true)}
            >
              <Mail className="w-4 h-4 shrink-0" />
              View sent emails
            </Button>
          }
        />

        {!settingsMissing ? (
          <div className="rounded-lg border border-border bg-card px-4 py-3 sm:px-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="space-y-0.5">
              <Label htmlFor="email-open-tracking" className="text-sm font-medium">
                Open tracking pixel
              </Label>
              <p className="text-xs text-muted-foreground max-w-xl">
                When on, new HTML emails include a 1×1 pixel to detect opens. Sent emails are always
                logged; turning this off only stops the pixel on future sends.
              </p>
            </div>
            <Switch
              id="email-open-tracking"
              checked={trackingEnabled}
              disabled={trackingLoading || trackingSaving}
              onCheckedChange={handleTrackingToggle}
            />
          </div>
        ) : null}
      </div>

      <EmailSentLogDialog open={logOpen} onOpenChange={setLogOpen} />
    </>
  );
}
