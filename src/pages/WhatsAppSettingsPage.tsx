import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  Loader2,
  RefreshCw,
  Save,
  Settings2,
  ShieldOff,
  IndianRupee,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  DEFAULT_WHATSAPP_CRM_SETTINGS,
  estimateWhatsAppBill,
  fetchWhatsAppCrmSettings,
  fetchWhatsAppUsageStats,
  formatInr,
  saveWhatsAppCrmSettings,
  type WhatsAppCrmSettings,
  type WhatsAppUsageStats,
} from '@/lib/whatsappCrmSettings';

type Props = {
  hideHeader?: boolean;
  onBack?: () => void;
  onOpenInbox?: () => void;
};

export default function WhatsAppSettingsPage({ hideHeader, onBack, onOpenInbox }: Props) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<WhatsAppCrmSettings>({
    ...DEFAULT_WHATSAPP_CRM_SETTINGS,
  });
  const [stats, setStats] = useState<WhatsAppUsageStats | null>(null);
  const [statsError, setStatsError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setStatsError(null);
    try {
      const [s, u] = await Promise.all([fetchWhatsAppCrmSettings(), fetchWhatsAppUsageStats()]);
      if (!s.ok) {
        toast.error(s.error || 'Could not load WhatsApp settings');
      }
      setSettings(s.settings);
      setDirty(false);
      if (!u.ok) {
        setStatsError(u.error || 'Could not load usage');
        setStats(null);
      } else {
        setStats(u.stats);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const patch = <K extends keyof WhatsAppCrmSettings>(key: K, value: WhatsAppCrmSettings[K]) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
    setDirty(true);
  };

  const bill = useMemo(() => {
    if (!stats) return null;
    return estimateWhatsAppBill(settings, stats, { windowDays: 7 });
  }, [settings, stats]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const result = await saveWhatsAppCrmSettings(settings);
      if (!result.ok) {
        toast.error(result.error || 'Save failed');
        return;
      }
      if (result.settings) setSettings(result.settings);
      setDirty(false);
      toast.success('WhatsApp settings saved');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-sm text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        Loading WhatsApp settings…
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4 pb-10">
      {!hideHeader ? (
        <div className="flex flex-wrap items-center gap-3">
          {onBack ? (
            <Button type="button" variant="ghost" size="sm" onClick={onBack} className="-ml-2">
              <ArrowLeft className="mr-1 h-4 w-4" />
              Back
            </Button>
          ) : null}
          <img src="/whatsapp.png" alt="" className="h-7 w-7 rounded-md object-contain" />
          <div className="min-w-0 flex-1">
            <h1 className="text-lg font-semibold text-foreground">WhatsApp settings</h1>
            <p className="text-xs text-muted-foreground">
              Master controls, rate card, and expected Meta bill
            </p>
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-9"
          onClick={() => void load()}
          disabled={saving}
        >
          <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
          Refresh
        </Button>
        {onOpenInbox ? (
          <Button type="button" variant="outline" size="sm" className="h-9" onClick={onOpenInbox}>
            <img src="/whatsapp.png" alt="" className="mr-1.5 h-3.5 w-3.5 object-contain" />
            Open inbox
          </Button>
        ) : null}
        <Button
          type="button"
          size="sm"
          className="h-9 ml-auto bg-emerald-700 hover:bg-emerald-800"
          disabled={!dirty || saving}
          onClick={() => void handleSave()}
        >
          {saving ? (
            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
          ) : (
            <Save className="mr-1.5 h-3.5 w-3.5" />
          )}
          Save
        </Button>
      </div>

      {/* Master toggle */}
      <Card
        className={cn(
          'border-2',
          settings.enabled ? 'border-emerald-200 bg-emerald-50/40' : 'border-amber-200 bg-amber-50/50'
        )}
      >
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                {settings.enabled ? (
                  <Settings2 className="h-4 w-4 text-emerald-700" />
                ) : (
                  <ShieldOff className="h-4 w-4 text-amber-700" />
                )}
                WhatsApp Cloud API
              </CardTitle>
              <CardDescription className="mt-1">
                Universal kill switch for CRM sends (inbox, AMC, composer, pending payments).
              </CardDescription>
            </div>
            <Switch
              checked={settings.enabled}
              onCheckedChange={(v) => patch('enabled', v)}
              aria-label="Enable WhatsApp Cloud API"
            />
          </div>
        </CardHeader>
        <CardContent>
          <Badge variant={settings.enabled ? 'default' : 'secondary'}>
            {settings.enabled ? 'Enabled' : 'Disabled — sends blocked'}
          </Badge>
        </CardContent>
      </Card>

      {/* Message-type toggles */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Message types</CardTitle>
          <CardDescription>What kinds of WhatsApp Cloud API messages are allowed.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <ToggleRow
            label="Cold templates"
            description="Approved Meta templates when the 24h window is closed"
            checked={settings.allow_cold_templates}
            disabled={!settings.enabled}
            onCheckedChange={(v) => patch('allow_cold_templates', v)}
          />
          <ToggleRow
            label="PDF / media"
            description="PDFs and chat attachments (images) via WhatsApp"
            checked={settings.allow_pdf_send}
            disabled={!settings.enabled}
            onCheckedChange={(v) => patch('allow_pdf_send', v)}
          />
          <ToggleRow
            label="Free-form text"
            description="Manual replies inside the 24h customer service window"
            checked={settings.allow_freeform}
            disabled={!settings.enabled}
            onCheckedChange={(v) => patch('allow_freeform', v)}
          />
        </CardContent>
      </Card>

      {/* Per-surface toggles */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Where WhatsApp can send</CardTitle>
          <CardDescription>
            Turn off Cloud API sends from each CRM screen. Off = blocked server-side (no wa.me
            fallback for that surface).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <ToggleRow
            label="WhatsApp inbox"
            description="Chat replies, templates, and attachments in the inbox"
            checked={settings.allow_inbox}
            disabled={!settings.enabled}
            onCheckedChange={(v) => patch('allow_inbox', v)}
          />
          <ToggleRow
            label="Calling"
            description="WhatsApp from the Calling / missed-call flows"
            checked={settings.allow_calling}
            disabled={!settings.enabled}
            onCheckedChange={(v) => patch('allow_calling', v)}
          />
          <ToggleRow
            label="Service reminders"
            description="RO service-due reminders from Reminders"
            checked={settings.allow_service_reminder}
            disabled={!settings.enabled}
            onCheckedChange={(v) => patch('allow_service_reminder', v)}
          />
          <ToggleRow
            label="Pending payments"
            description="Payment follow-ups from Pending payments"
            checked={settings.allow_pending_payment}
            disabled={!settings.enabled}
            onCheckedChange={(v) => patch('allow_pending_payment', v)}
          />
          <ToggleRow
            label="Documents (PDF)"
            description="AMC, quotation, invoice, bill, warranty WhatsApp share"
            checked={settings.allow_documents}
            disabled={!settings.enabled}
            onCheckedChange={(v) => patch('allow_documents', v)}
          />
          <ToggleRow
            label="Customer composer"
            description="Admin Tools → WhatsApp composer on a customer"
            checked={settings.allow_composer}
            disabled={!settings.enabled}
            onCheckedChange={(v) => patch('allow_composer', v)}
          />
          <ToggleRow
            label="Technician assigned"
            description="Share assigned technician details to the customer"
            checked={settings.allow_tech_assigned}
            disabled={!settings.enabled}
            onCheckedChange={(v) => patch('allow_tech_assigned', v)}
          />
          <ToggleRow
            label="Booking bot"
            description="When customer says Hi — Book → confirm → auto job (24h window)"
            checked={settings.allow_booking_bot}
            disabled={!settings.enabled}
            onCheckedChange={(v) => patch('allow_booking_bot', v)}
          />
        </CardContent>
      </Card>

      {/* Rate card */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <IndianRupee className="h-4 w-4" />
            Meta rate card (INR)
          </CardTitle>
          <CardDescription>
            Editable estimates for India Cloud API. Defaults match common 2026 utility / marketing
            rates — update when Meta changes the card. Service replies are usually ₹0.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <RateField
            label="Utility (₹ / msg)"
            value={settings.rate_utility_inr}
            onChange={(v) => patch('rate_utility_inr', v)}
            hint="Cold templates (payment, AMC, invoice invites…)"
          />
          <RateField
            label="Marketing (₹ / msg)"
            value={settings.rate_marketing_inr}
            onChange={(v) => patch('rate_marketing_inr', v)}
            hint="Promotional templates (if you add any)"
          />
          <RateField
            label="Authentication (₹ / msg)"
            value={settings.rate_authentication_inr}
            onChange={(v) => patch('rate_authentication_inr', v)}
            hint="OTP / login templates"
          />
          <RateField
            label="Service (₹ / msg)"
            value={settings.rate_service_inr}
            onChange={(v) => patch('rate_service_inr', v)}
            hint="In-window free-form / PDF (usually 0)"
          />
          <div className="sm:col-span-2 space-y-1.5">
            <Label htmlFor="wa-budget">Monthly budget alert (₹, optional)</Label>
            <Input
              id="wa-budget"
              type="number"
              min={0}
              step={1}
              placeholder="e.g. 2000"
              value={settings.monthly_budget_inr ?? ''}
              onChange={(e) => {
                const raw = e.target.value.trim();
                patch('monthly_budget_inr', raw === '' ? null : Number(raw));
              }}
            />
            <p className="text-[11px] text-muted-foreground">
              Warns when projected monthly spend from the last 7 days exceeds this.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Usage + bill */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Usage & expected bill</CardTitle>
          <CardDescription>
            Based on messages stored in CRM (7-day retention). Cold = template sends; session =
            free-form text + PDF.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {statsError ? (
            <p className="text-sm text-red-600">{statsError}</p>
          ) : stats ? (
            <>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <StatChip label="Outbound" value={String(stats.outbound)} />
                <StatChip label="Inbound" value={String(stats.inbound)} />
                <StatChip label="Cold templates" value={String(stats.cold_utility)} accent />
                <StatChip label="Session msgs" value={String(stats.session_messages)} />
                <StatChip label="PDFs" value={String(stats.documents)} />
                <StatChip label="Text" value={String(stats.text)} />
                <StatChip label="Sent/delivered" value={String(stats.delivered_or_sent)} />
                <StatChip label="Failed" value={String(stats.failed)} />
              </div>

              {bill ? (
                <div
                  className={cn(
                    'rounded-lg border p-3 space-y-2',
                    bill.overBudget ? 'border-amber-300 bg-amber-50' : 'bg-muted/40'
                  )}
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="text-sm font-medium text-foreground">Last 7 days estimate</p>
                    <p className="text-lg font-semibold tabular-nums">{formatInr(bill.total)}</p>
                  </div>
                  <ul className="space-y-1 text-xs text-muted-foreground">
                    <li>
                      Utility cold ({stats.cold_utility} × {formatInr(settings.rate_utility_inr, 4)})
                      : {formatInr(bill.utilityCost)}
                    </li>
                    <li>
                      Session ({stats.session_messages} × {formatInr(settings.rate_service_inr, 4)}):{' '}
                      {formatInr(bill.serviceCost)}
                    </li>
                  </ul>
                  <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-2 text-sm">
                    <span className="text-muted-foreground">Projected monthly</span>
                    <span
                      className={cn(
                        'font-semibold tabular-nums',
                        bill.overBudget ? 'text-amber-800' : 'text-foreground'
                      )}
                    >
                      {formatInr(bill.projectedMonthly)}
                      {bill.overBudget ? ' · over budget' : ''}
                    </span>
                  </div>
                </div>
              ) : null}
            </>
          ) : (
            <p className="text-sm text-muted-foreground">No usage data yet.</p>
          )}
          <p className="text-[11px] text-muted-foreground">
            Estimate only — Meta bills on delivery by category. Failed sends are listed separately
            and still counted in outbound totals.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Notes</CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea
            value={settings.notes || ''}
            onChange={(e) => patch('notes', e.target.value)}
            placeholder="Internal notes (ngrok URL, WABA id, who owns Meta access…)"
            rows={3}
            className="text-sm"
          />
        </CardContent>
      </Card>
    </div>
  );
}

function ToggleRow(props: {
  label: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  onCheckedChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-border/60 pb-3 last:border-0 last:pb-0">
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground">{props.label}</p>
        <p className="text-xs text-muted-foreground">{props.description}</p>
      </div>
      <Switch
        checked={props.checked}
        disabled={props.disabled}
        onCheckedChange={props.onCheckedChange}
      />
    </div>
  );
}

function RateField(props: {
  label: string;
  value: number;
  hint: string;
  onChange: (v: number) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{props.label}</Label>
      <Input
        type="number"
        min={0}
        step={0.0001}
        value={props.value}
        onChange={(e) => props.onChange(Number(e.target.value) || 0)}
        className="h-10 tabular-nums"
      />
      <p className="text-[11px] text-muted-foreground">{props.hint}</p>
    </div>
  );
}

function StatChip(props: { label: string; value: string; accent?: boolean }) {
  return (
    <div
      className={cn(
        'rounded-md border px-2.5 py-2',
        props.accent ? 'border-emerald-200 bg-emerald-50/60' : 'bg-background'
      )}
    >
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{props.label}</p>
      <p className="text-base font-semibold tabular-nums text-foreground">{props.value}</p>
    </div>
  );
}
