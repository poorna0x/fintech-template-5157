import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Loader2,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import {
  DEFAULT_WHATSAPP_CRM_SETTINGS,
  currentMonthKey,
  estimateWhatsAppBill,
  fetchWhatsAppCrmSettings,
  fetchWhatsAppUsageForMonth,
  fetchWhatsAppUsageMonthlyHistory,
  formatMonthLabel,
  maybeAutoRefreshWhatsAppUsageMonth,
  parseMonthKey,
  formatInr,
  saveWhatsAppCrmSettings,
  shiftMonthKey,
  type WhatsAppCrmSettings,
  type WhatsAppUsageMonthlySnapshot,
  type WhatsAppUsageStats,
} from '@/lib/whatsappCrmSettings';
import { TECH_PUSH_CATEGORIES, TECH_PUSH_LABELS } from '@/lib/pushNotificationPrefs';
import {
  TECH_WHATSAPP_AUTO_MIRROR_CATEGORIES,
  normalizeTechPushWhatsAppGlobal,
} from '@/lib/techWhatsAppPrefs';
import WhatsAppTemplatesManageCard from '@/components/admin/WhatsAppTemplatesManageCard';

type Props = {
  hideHeader?: boolean;
  onBack?: () => void;
};

export default function WhatsAppSettingsPage({ hideHeader, onBack }: Props) {
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState<WhatsAppCrmSettings>({
    ...DEFAULT_WHATSAPP_CRM_SETTINGS,
  });
  const [stats, setStats] = useState<WhatsAppUsageStats | null>(null);
  const [statsError, setStatsError] = useState<string | null>(null);
  const [usageMonth, setUsageMonth] = useState(currentMonthKey);
  const [monthlyHistory, setMonthlyHistory] = useState<WhatsAppUsageMonthlySnapshot[]>([]);
  const [usageRefreshing, setUsageRefreshing] = useState(false);
  const skipAutoSaveRef = useRef(true);
  const saveTimerRef = useRef<number | null>(null);

  const loadUsage = useCallback(async (monthKey: string) => {
    setStatsError(null);
    setUsageRefreshing(true);
    const parsed = parseMonthKey(monthKey);
    if (!parsed) {
      setStatsError('Invalid month');
      setStats(null);
      setUsageRefreshing(false);
      return;
    }
    try {
      const [u, history] = await Promise.all([
        fetchWhatsAppUsageForMonth(parsed.year, parsed.month),
        fetchWhatsAppUsageMonthlyHistory(12),
      ]);
      if (!u.ok) {
        setStatsError(u.error || 'Could not load usage');
        setStats(null);
      } else {
        setStats(u.stats);
      }
      let rows = history.ok ? history.rows : [];
      const existing = rows.find((r) => r.month_key === monthKey) || null;
      const autoSaved = await maybeAutoRefreshWhatsAppUsageMonth(monthKey, existing);
      if (autoSaved) {
        const again = await fetchWhatsAppUsageMonthlyHistory(12);
        if (again.ok) rows = again.rows;
      }
      setMonthlyHistory(rows);
    } finally {
      setUsageRefreshing(false);
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    skipAutoSaveRef.current = true;
    try {
      const s = await fetchWhatsAppCrmSettings({ force: true });
      if (!s.ok) {
        toast.error(s.error || 'Could not load WhatsApp settings');
      }
      setSettings(s.settings);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (loading) return;
    void loadUsage(usageMonth);
  }, [usageMonth, loadUsage, loading]);

  const persistSettings = useCallback(async (next: WhatsAppCrmSettings) => {
    const result = await saveWhatsAppCrmSettings(next);
    if (!result.ok) {
      toast.error(result.error || 'Could not save WhatsApp settings');
    }
  }, []);

  useEffect(() => {
    if (loading) return;
    if (skipAutoSaveRef.current) {
      skipAutoSaveRef.current = false;
      return;
    }
    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(() => {
      void persistSettings(settings);
    }, 450);
    return () => {
      if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    };
  }, [settings, loading, persistSettings]);

  const patch = <K extends keyof WhatsAppCrmSettings>(key: K, value: WhatsAppCrmSettings[K]) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  const bill = useMemo(() => {
    if (!stats) return null;
    return estimateWhatsAppBill(settings, stats, { actualPeriodBill: true });
  }, [settings, stats]);

  const savedSnapshot = useMemo(
    () => monthlyHistory.find((r) => r.month_key === usageMonth) || null,
    [monthlyHistory, usageMonth]
  );

  const canGoNextMonth = usageMonth < currentMonthKey();

  const monthOptions = useMemo(() => {
    const keys = new Set<string>();
    let cursor = currentMonthKey();
    for (let i = 0; i < 36; i += 1) {
      keys.add(cursor);
      cursor = shiftMonthKey(cursor, -1);
    }
    for (const row of monthlyHistory) keys.add(row.month_key);
    keys.add(usageMonth);
    return Array.from(keys).sort((a, b) => b.localeCompare(a));
  }, [monthlyHistory, usageMonth]);

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
                Master switch for CRM Cloud API. When off, send options are hidden everywhere
                (inbox composer, Direct Sale, pending payments, PDF WhatsApp, tech pay QR, Calling,
                etc.). Phone wa.me shortcuts stay available where they are personal WhatsApp.
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
            {settings.enabled ? 'Enabled' : 'Disabled — Cloud API send UI hidden'}
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

      {/* Website /book confirmation */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Website booking confirmation</CardTitle>
          <CardDescription>
            WhatsApp sent to the customer after they book on hydrogenro.com/book or elevenro.com/book
            (approved UTILITY template). Soft-fails — never blocks the booking.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <ToggleRow
            label="Enable website booking WhatsApp"
            description="Allow confirmation WhatsApp for public website bookings. Requires Cold templates ON."
            checked={settings.allow_online_booking_whatsapp}
            disabled={!settings.enabled}
            onCheckedChange={(v) => patch('allow_online_booking_whatsapp', v)}
          />
          <ToggleRow
            label="Auto-send after online booking"
            description="Send automatically when a public /book job is created (same time as confirmation email). Deduped 30 min per phone."
            checked={settings.auto_send_online_booking_whatsapp}
            disabled={
              !settings.enabled ||
              !settings.allow_online_booking_whatsapp ||
              !settings.allow_cold_templates
            }
            onCheckedChange={(v) => patch('auto_send_online_booking_whatsapp', v)}
          />
          {!settings.allow_cold_templates ? (
            <p className="text-xs text-amber-800">
              Turn on <span className="font-medium">Cold templates</span> above — website booking
              confirmation uses a Meta template outside the 24h window.
            </p>
          ) : null}
        </CardContent>
      </Card>

      {/* Per-surface toggles */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Where WhatsApp can send</CardTitle>
          <CardDescription>
            Turn off each CRM WhatsApp path. Job assign/unassign popup master is in Dashboard Settings;
            auto-send toggles are below. Per-technician limits: Edit technician.
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
            label="Auto-send missed-call callback"
            description="When a missed customer call is reported (admin/tech phone), send svc_missed_call via Cloud API. Deduped for 6 hours. Requires Calling ON."
            checked={settings.auto_send_missed_call_whatsapp}
            disabled={!settings.enabled || !settings.allow_calling}
            onCheckedChange={(v) => patch('auto_send_missed_call_whatsapp', v)}
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
            label="Job completion → customer"
            description="Allow completion confirmation WhatsApp (manual Send Message + auto-send). Uses Hydrogen RO / Eleven RO copy from the job brand."
            checked={settings.allow_job_completion_whatsapp}
            disabled={!settings.enabled}
            onCheckedChange={(v) => patch('allow_job_completion_whatsapp', v)}
          />
          <ToggleRow
            label="Auto-send completion message"
            description="After a job is completed, send the brand completion WhatsApp via Cloud API when the 24h window is open. Skips jobs where the tech added AMC info or marked “Don’t send”. Cold template later when Meta-approved."
            checked={settings.auto_send_job_completion_whatsapp}
            disabled={!settings.enabled || !settings.allow_job_completion_whatsapp}
            onCheckedChange={(v) => patch('auto_send_job_completion_whatsapp', v)}
          />
          <ToggleRow
            label="Salary slip → technician"
            description="Allow month-end salary-slip PDFs on WhatsApp. Same control on phone and laptop."
            checked={settings.allow_salary_slip_whatsapp}
            disabled={!settings.enabled}
            onCheckedChange={(v) => patch('allow_salary_slip_whatsapp', v)}
          />
          <ToggleRow
            label="Auto-send salary slip"
            description="Last calendar day ~9:00 PM IST. Sends to active technicians who are opted in on Edit technician. Turn this off to stop all salary-slip WhatsApp."
            checked={settings.auto_send_salary_slip_whatsapp}
            disabled={!settings.enabled || !settings.allow_salary_slip_whatsapp}
            onCheckedChange={(v) => patch('auto_send_salary_slip_whatsapp', v)}
          />
          <ToggleRow
            label="Auto-send on assign (instant)"
            description="When Dashboard job WhatsApp is ON: send via Cloud API immediately after assign (no dialog). OFF = open manual wa.me dialog."
            checked={settings.auto_send_job_assign_whatsapp}
            onCheckedChange={(v) => patch('auto_send_job_assign_whatsapp', v)}
          />
          <ToggleRow
            label="Auto-send on unassign (instant)"
            description="When Dashboard job WhatsApp is ON: send via Cloud API immediately after unassign. OFF = open manual wa.me dialog."
            checked={settings.auto_send_job_unassign_whatsapp}
            onCheckedChange={(v) => patch('auto_send_job_unassign_whatsapp', v)}
          />
          <ToggleRow
            label="Technician assigned → customer"
            description="Share assigned technician details to the customer (Cloud API)"
            checked={settings.allow_tech_assigned}
            disabled={!settings.enabled}
            onCheckedChange={(v) => patch('allow_tech_assigned', v)}
          />
          <ToggleRow
            label="Technician unassigned → customer"
            description="Notify customer when technician is removed (Cloud API, when you send)"
            checked={settings.allow_tech_unassigned}
            disabled={!settings.enabled}
            onCheckedChange={(v) => patch('allow_tech_unassigned', v)}
          />
          <ToggleRow
            label="Booking bot"
            description="Hi or any first message → Service/Repair · Reinstallation · Chat with us (Eleven 9880693311). Clear intents (repair/leak/reinstall) skip straight into booking. Different location saves a secondary site + optional alternate phone. After booking, free-form text/files redirect to Call 3311 / WhatsApp team."
            checked={settings.allow_booking_bot}
            disabled={!settings.enabled}
            onCheckedChange={(v) => patch('allow_booking_bot', v)}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Technician push → WhatsApp</CardTitle>
          <CardDescription>
            Same categories as FCM to technicians. When ON, those alerts also send via Cloud API to
            the tech WhatsApp/phone (needs open 24h window). Assign/unassign stay on Dashboard +
            auto-send above. Location ping has no WhatsApp (silent GPS only).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {TECH_PUSH_CATEGORIES.map((key) => {
            const meta = TECH_PUSH_LABELS[key];
            const isMirror = (TECH_WHATSAPP_AUTO_MIRROR_CATEGORIES as readonly string[]).includes(
              key
            );
            const isAssign = key === 'job_assigned' || key === 'job_unassigned';
            const isLocation = key === 'location_ping';
            return (
              <ToggleRow
                key={key}
                label={meta.label}
                description={
                  isLocation
                    ? 'No WhatsApp — silent location request only.'
                    : isAssign
                      ? 'Also controlled by Dashboard master. Prefer Dashboard for quick on/off; Auto-send is above.'
                      : isMirror
                        ? `Also WhatsApp when this push fires. ${meta.description}`
                        : meta.description
                }
                checked={
                  isAssign
                    ? key === 'job_assigned'
                      ? settings.allow_job_assign_whatsapp
                      : settings.allow_job_unassign_whatsapp
                    : settings.tech_push_whatsapp?.[key] !== false
                }
                disabled={!settings.enabled || isLocation}
                onCheckedChange={(v) => {
                  if (isLocation) return;
                  if (key === 'job_assigned') {
                    patch('allow_job_assign_whatsapp', v);
                    return;
                  }
                  if (key === 'job_unassigned') {
                    patch('allow_job_unassign_whatsapp', v);
                    return;
                  }
                  patch(
                    'tech_push_whatsapp',
                    normalizeTechPushWhatsAppGlobal({
                      ...settings.tech_push_whatsapp,
                      [key]: v,
                    })
                  );
                }}
              />
            );
          })}
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
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <CardTitle className="text-base">Usage & expected bill</CardTitle>
              <CardDescription>
                Calendar month (IST). Snapshots save automatically. Tap the month name to jump to
                any past month, or use ‹ › for one step.
              </CardDescription>
            </div>
            <div className="flex h-10 w-full items-center rounded-lg border border-input bg-background sm:w-auto">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-10 w-10 shrink-0 rounded-r-none"
                aria-label="Previous month"
                onClick={() => setUsageMonth(shiftMonthKey(usageMonth, -1))}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Select value={usageMonth} onValueChange={setUsageMonth}>
                <SelectTrigger
                  aria-label="Select month"
                  className="h-10 min-w-[10.5rem] flex-1 rounded-none border-0 bg-transparent px-2 shadow-none focus:ring-0 focus:ring-offset-0 [&>svg]:opacity-60"
                >
                  <SelectValue>
                    <span className="inline-flex items-center gap-1.5 font-medium tabular-nums">
                      {usageRefreshing ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                      ) : null}
                      {formatMonthLabel(usageMonth)}
                    </span>
                  </SelectValue>
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  {monthOptions.map((key) => (
                    <SelectItem key={key} value={key}>
                      {formatMonthLabel(key)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-10 w-10 shrink-0 rounded-l-none"
                aria-label="Next month"
                disabled={!canGoNextMonth}
                onClick={() => setUsageMonth(shiftMonthKey(usageMonth, 1))}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {statsError ? (
            <p className="text-sm text-red-600">{statsError}</p>
          ) : stats ? (
            <>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <StatChip label="Outbound" value={String(stats.outbound)} />
                <StatChip label="Inbound" value={String(stats.inbound)} />
                <StatChip label="Cold (Meta tpl)" value={String(stats.cold_utility)} accent />
                <StatChip label="Session msgs" value={String(stats.session_messages)} />
                <StatChip label="Text templates" value={String(stats.templates)} />
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
                    <p className="text-sm font-medium text-foreground">
                      {usageMonth} estimate (live from CRM log)
                    </p>
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
                  {savedSnapshot ? (
                    <p className="text-[11px] text-muted-foreground border-t pt-2">
                      Snapshot {savedSnapshot.cold_utility} cold ·{' '}
                      {formatInr(Number(savedSnapshot.estimated_total_inr))} · auto-saved{' '}
                      {new Date(savedSnapshot.updated_at).toLocaleString('en-IN', {
                        dateStyle: 'medium',
                        timeStyle: 'short',
                      })}
                    </p>
                  ) : (
                    <p className="text-[11px] text-muted-foreground border-t pt-2">
                      Snapshot will auto-save for this month (nightly + when you open this page).
                    </p>
                  )}
                  <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-2 text-sm">
                    <span className="text-muted-foreground">vs monthly budget</span>
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

              {monthlyHistory.length > 0 ? (
                <div className="rounded-lg border overflow-hidden">
                  <div className="bg-muted/40 px-3 py-2 text-xs font-medium text-muted-foreground">
                    Saved monthly snapshots
                  </div>
                  <ul className="divide-y text-xs">
                    {monthlyHistory.map((row) => (
                      <li
                        key={row.month_key}
                        className="flex flex-wrap items-center justify-between gap-2 px-3 py-2"
                      >
                        <button
                          type="button"
                          className={cn(
                            'rounded-md px-2 py-1 text-xs font-medium',
                            row.month_key === usageMonth
                              ? 'bg-emerald-100 text-emerald-900'
                              : 'text-foreground hover:bg-muted'
                          )}
                          onClick={() => setUsageMonth(row.month_key)}
                        >
                          {formatMonthLabel(row.month_key)}
                        </button>
                        <span className="text-muted-foreground">
                          {row.cold_utility} cold · {row.session_messages} session
                        </span>
                        <span className="font-medium tabular-nums">
                          {formatInr(Number(row.estimated_total_inr))}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </>
          ) : (
            <p className="text-sm text-muted-foreground">No usage data yet.</p>
          )}
          <p className="text-[11px] text-muted-foreground">
            Estimate only — Meta bills on delivery by category. Cold (Meta tpl) excludes
            test numbers (e.g. 9876543210) and failed sends. Compare with Meta Manager
            template sends for the same month.
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

      <WhatsAppTemplatesManageCard />
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
    <div className="flex min-h-11 items-start justify-between gap-3 border-b border-border/60 py-3 last:border-0 last:pb-0">
      <div className="min-w-0 pt-0.5">
        <p className="text-sm font-medium text-foreground">{props.label}</p>
        <p className="text-xs text-muted-foreground">{props.description}</p>
      </div>
      <Switch
        checked={props.checked}
        disabled={props.disabled}
        onCheckedChange={props.onCheckedChange}
        className="mt-0.5 shrink-0"
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
