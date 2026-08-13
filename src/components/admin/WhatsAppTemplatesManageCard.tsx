import { useCallback, useMemo, useState } from 'react';
import {
  ChevronDown,
  FileText,
  Loader2,
  Plus,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
import { cn } from '@/lib/utils';
import {
  createWhatsAppTemplate,
  deleteWhatsAppTemplate,
  fetchManagedWhatsAppTemplates,
  fillWhatsAppTemplatePreview,
  listTemplatePlaceholders,
  type WhatsAppManagedTemplate,
  type WhatsAppTemplateCounts,
} from '@/lib/whatsappTemplateManage';

type StatusFilter = 'ALL' | 'APPROVED' | 'PENDING' | 'REJECTED';

function statusTone(status: string): string {
  switch (String(status || '').toUpperCase()) {
    case 'APPROVED':
      return 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200';
    case 'PENDING':
      return 'bg-amber-50 text-amber-800 ring-1 ring-amber-200';
    case 'REJECTED':
      return 'bg-rose-50 text-rose-700 ring-1 ring-rose-200';
    default:
      return 'bg-slate-50 text-slate-600 ring-1 ring-slate-200';
  }
}

function brandHint(name: string): string {
  if (/_hro/i.test(name)) return 'HRO';
  if (/_ero/i.test(name)) return 'ERO';
  return '';
}

const DEFAULT_VAR_SAMPLES = ['Rahul', '500', '15 Aug 2026', 'RO2608121234', '10:30 AM', 'Tech'];

export default function WhatsAppTemplatesManageCard() {
  const [loadedOnce, setLoadedOnce] = useState(false);
  const [loading, setLoading] = useState(false);
  const [templates, setTemplates] = useState<WhatsAppManagedTemplate[]>([]);
  const [counts, setCounts] = useState<WhatsAppTemplateCounts | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteName, setDeleteName] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [formName, setFormName] = useState('');
  const [formBody, setFormBody] = useState(
    'Hi {{1}}, this is an update from Hydrogen RO regarding your pending payment for water purifier service.\n\nAmount pending: INR {{2}}\nDue date: {{3}}\nInvoice / Job: {{4}}\n\nTap Pay now below or reply on this chat if you have already paid.'
  );
  const [formExamples, setFormExamples] = useState<string[]>([
    'Rahul',
    '500',
    '15 Aug 2026',
    'RO2608121234',
  ]);
  const [formCallPhone, setFormCallPhone] = useState('8884944288');
  const [formUrl, setFormUrl] = useState('https://hydrogenro.com/p/{{1}}');
  const [formUrlText, setFormUrlText] = useState('Pay now');
  const [formUrlExample, setFormUrlExample] = useState('pay123456');
  const [formQuickReply, setFormQuickReply] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const result = await fetchManagedWhatsAppTemplates();
    if (!result.ok) {
      setError(result.error || 'Could not load templates');
      setTemplates([]);
      setCounts(null);
    } else {
      setTemplates(result.templates);
      setCounts(result.counts || null);
      setLoadedOnce(true);
    }
    setLoading(false);
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return templates.filter((t) => {
      if (statusFilter !== 'ALL' && t.status !== statusFilter) return false;
      if (!q) return true;
      return (
        t.name.toLowerCase().includes(q) ||
        String(t.bodyPreview || '')
          .toLowerCase()
          .includes(q) ||
        String(t.category || '')
          .toLowerCase()
          .includes(q)
      );
    });
  }, [templates, query, statusFilter]);

  const handleCreate = async () => {
    setBusy(true);
    try {
      const result = await createWhatsAppTemplate({
        name: formName,
        body: formBody,
        examples: syncedExamples,
        callPhone: formCallPhone.trim() || undefined,
        urlButtonUrl: formUrl.trim() || undefined,
        urlButtonText: formUrlText.trim() || 'Open',
        urlButtonExample: formUrlExample.trim() || undefined,
        quickReply: formQuickReply.trim() || undefined,
      });
      if (!result.ok) {
        toast.error(result.error || 'Create failed');
        return;
      }
      toast.success(`Submitted ${result.name} (${result.status || 'PENDING'})`);
      setCreateOpen(false);
      setFormName('');
      if (loadedOnce) await load();
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteName) return;
    setBusy(true);
    try {
      const result = await deleteWhatsAppTemplate(deleteName);
      if (!result.ok) {
        toast.error(result.error || 'Delete failed');
        return;
      }
      toast.success(`Deleted ${deleteName}`);
      setDeleteName(null);
      if (expanded?.startsWith(`${deleteName}:`)) setExpanded(null);
      if (loadedOnce) await load();
    } finally {
      setBusy(false);
    }
  };

  const placeholderIndexes = useMemo(() => listTemplatePlaceholders(formBody), [formBody]);
  const urlHasVar = /\{\{\s*1\s*\}\}/.test(formUrl);
  const buttonPreview = useMemo(() => {
    const bits: string[] = [];
    if (formCallPhone.replace(/\D/g, '').length >= 10) bits.push('Call us');
    if (formUrl.trim()) bits.push(formUrlText.trim() || 'Open');
    if (formQuickReply.trim()) bits.push(formQuickReply.trim());
    return bits;
  }, [formCallPhone, formUrl, formUrlText, formQuickReply]);

  // Keep example slots aligned with detected {{n}} count.
  const syncedExamples = useMemo(() => {
    const max = Math.max(...placeholderIndexes, 0);
    const next = [...formExamples];
    while (next.length < max) {
      next.push(DEFAULT_VAR_SAMPLES[next.length] || `Sample${next.length + 1}`);
    }
    return next;
  }, [formExamples, placeholderIndexes]);

  return (
    <>
      <Card className="border-slate-200/80 shadow-sm">
        <CardHeader className="space-y-3 pb-3">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-900 text-white">
              <FileText className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <CardTitle className="text-base">Meta templates</CardTitle>
              <CardDescription className="mt-0.5">
                Browse, preview, add, or delete WhatsApp Business templates. Loads only when you tap
                Load templates — not on every Settings open.
              </CardDescription>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {!loadedOnce ? (
              <Button
                type="button"
                className="h-9 rounded-lg bg-slate-900 px-3.5 text-white hover:bg-slate-800"
                onClick={() => void load()}
                disabled={loading || busy}
              >
                {loading ? (
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                ) : (
                  <FileText className="mr-1.5 h-4 w-4" />
                )}
                Load templates
              </Button>
            ) : null}
            <Button
              type="button"
              variant="outline"
              className="h-9 rounded-lg border-slate-200 px-3.5"
              onClick={() => setCreateOpen(true)}
              disabled={busy}
            >
              <Plus className="mr-1.5 h-4 w-4" />
              Add template
            </Button>
          </div>
        </CardHeader>

        <CardContent className="space-y-3 pt-0">
          {!loadedOnce && !loading ? (
            <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/70 px-4 py-8 text-center">
              <p className="text-sm font-medium text-slate-800">Templates not loaded</p>
              <p className="mt-1 text-xs text-slate-500">
                Tap <span className="font-medium text-slate-700">Load templates</span> to fetch from
                Meta when you need them.
              </p>
            </div>
          ) : null}

          {loading && !loadedOnce ? (
            <div className="flex items-center justify-center gap-2 rounded-xl border border-slate-100 bg-slate-50/50 py-10 text-sm text-slate-600">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading from Meta…
            </div>
          ) : null}

          {error && !loadedOnce ? <p className="text-sm text-destructive">{error}</p> : null}

          {loadedOnce ? (
            <>
              {counts ? (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {[
                    { label: 'Total', value: counts.total, tone: 'bg-slate-50 text-slate-700' },
                    {
                      label: 'Approved',
                      value: counts.approved,
                      tone: 'bg-emerald-50 text-emerald-800',
                    },
                    {
                      label: 'Pending',
                      value: counts.pending,
                      tone: 'bg-amber-50 text-amber-900',
                    },
                    {
                      label: 'Rejected',
                      value: counts.rejected,
                      tone: 'bg-rose-50 text-rose-800',
                    },
                  ].map((c) => (
                    <div
                      key={c.label}
                      className={cn('rounded-xl px-3 py-2.5', c.tone)}
                    >
                      <p className="text-[10px] font-medium uppercase tracking-wide opacity-70">
                        {c.label}
                      </p>
                      <p className="text-lg font-semibold tabular-nums">{c.value}</p>
                    </div>
                  ))}
                </div>
              ) : null}

              <div className="flex flex-col gap-2">
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search by name or body…"
                  className="h-10 rounded-xl border-slate-200 bg-white"
                />
                <div className="inline-flex w-full overflow-hidden rounded-xl border border-slate-200 bg-white p-0.5 sm:w-auto">
                  {(['ALL', 'APPROVED', 'PENDING', 'REJECTED'] as const).map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setStatusFilter(s)}
                      className={cn(
                        'flex-1 px-3 py-1.5 text-xs font-medium transition-colors sm:flex-none',
                        statusFilter === s
                          ? 'rounded-lg bg-slate-900 text-white shadow-sm'
                          : 'rounded-lg text-slate-600 hover:bg-slate-50'
                      )}
                    >
                      {s === 'ALL' ? 'All' : s.charAt(0) + s.slice(1).toLowerCase()}
                    </button>
                  ))}
                </div>
              </div>

              {error ? <p className="text-sm text-destructive">{error}</p> : null}

              {loading ? (
                <div className="flex items-center gap-2 py-4 text-sm text-slate-500">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Refreshing…
                </div>
              ) : filtered.length === 0 ? (
                <p className="rounded-xl border border-slate-100 bg-slate-50/60 px-4 py-6 text-center text-sm text-slate-500">
                  No templates match.
                </p>
              ) : (
                <ul className="max-h-[26rem] space-y-2 overflow-y-auto pr-0.5">
                  {filtered.map((t) => {
                    const key = `${t.name}:${t.language}`;
                    const open = expanded === key;
                    const brand = brandHint(t.name);
                    return (
                      <li
                        key={key}
                        className="overflow-hidden rounded-xl border border-slate-200/90 bg-white shadow-sm"
                      >
                        <button
                          type="button"
                          className="flex w-full items-center gap-2.5 px-3.5 py-3 text-left transition-colors hover:bg-slate-50/80"
                          onClick={() => setExpanded(open ? null : key)}
                        >
                          <ChevronDown
                            className={cn(
                              'h-4 w-4 shrink-0 text-slate-400 transition-transform',
                              !open && '-rotate-90'
                            )}
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="truncate font-mono text-[12px] font-semibold text-slate-900">
                                {t.name}
                              </span>
                              {brand ? (
                                <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">
                                  {brand}
                                </span>
                              ) : null}
                              <span
                                className={cn(
                                  'rounded-md px-1.5 py-0.5 text-[10px] font-semibold',
                                  statusTone(t.status)
                                )}
                              >
                                {t.status}
                              </span>
                              {t.header?.format ? (
                                <span className="rounded-md bg-sky-50 px-1.5 py-0.5 text-[10px] font-medium text-sky-700 ring-1 ring-sky-100">
                                  {t.header.format}
                                </span>
                              ) : null}
                            </div>
                            {!open && t.bodyPreview ? (
                              <p className="mt-1 line-clamp-1 text-[11px] text-slate-500">
                                {t.bodyPreview}
                              </p>
                            ) : null}
                          </div>
                        </button>

                        {open ? (
                          <div className="space-y-3 border-t border-slate-100 bg-slate-50/40 px-3.5 py-3">
                            <div className="rounded-lg border border-slate-200 bg-white p-3">
                              <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                                Preview
                              </p>
                              <pre className="whitespace-pre-wrap font-sans text-[12px] leading-relaxed text-slate-800">
                                {fillWhatsAppTemplatePreview(t.bodyPreview)}
                              </pre>
                            </div>

                            {t.buttons?.length ? (
                              <div className="flex flex-wrap gap-1.5">
                                {t.buttons.map((b, i) => (
                                  <span
                                    key={`${b.type}-${i}`}
                                    className="inline-flex items-center rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] text-slate-700"
                                  >
                                    {b.type === 'PHONE_NUMBER'
                                      ? `Call · ${b.text || 'Call us'}`
                                      : b.type === 'URL'
                                        ? `Link · ${b.text || 'Open'}`
                                        : b.type === 'QUICK_REPLY'
                                          ? `Reply · ${b.text}`
                                          : `${b.type} · ${b.text || ''}`}
                                  </span>
                                ))}
                              </div>
                            ) : (
                              <p className="text-[11px] text-slate-400">No buttons</p>
                            )}

                            <div className="flex justify-end">
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="h-8 rounded-lg border-rose-200 text-rose-700 hover:bg-rose-50 hover:text-rose-800"
                                disabled={busy}
                                onClick={() => setDeleteName(t.name)}
                              >
                                <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                                Delete
                              </Button>
                            </div>
                          </div>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              )}
            </>
          ) : null}
        </CardContent>
      </Card>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto rounded-2xl sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Add Meta template</DialogTitle>
            <DialogDescription>
              Creates a UTILITY template on your WABA. Meta must approve it. Use {'{{1}}'}, {'{{2}}'}
              for variables. IMAGE/DOCUMENT headers are not supported here yet.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <div className="space-y-1.5">
              <Label htmlFor="wa-tpl-name">Name</Label>
              <Input
                id="wa-tpl-name"
                value={formName}
                onChange={(e) =>
                  setFormName(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_'))
                }
                placeholder="svc_custom_notice_hro_v1"
                className="h-10 rounded-xl font-mono text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="wa-tpl-body">Body</Label>
              <Textarea
                id="wa-tpl-body"
                value={formBody}
                onChange={(e) => setFormBody(e.target.value)}
                rows={8}
                className="rounded-xl text-sm"
              />
              <p className="text-[11px] text-slate-500">
                Use {'{{1}}'}, {'{{2}}'}… in order. Keep enough fixed text — Meta rejects short bodies
                with many variables.
              </p>
            </div>
            {placeholderIndexes.length > 0 ? (
              <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50/60 p-3">
                <p className="text-xs font-medium text-slate-700">
                  Sample values ({placeholderIndexes.length} variables)
                </p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {placeholderIndexes.map((n) => (
                    <div key={n} className="space-y-1">
                      <Label htmlFor={`wa-tpl-ex-${n}`} className="text-[11px] text-slate-500">
                        {`{{${n}}}`}
                      </Label>
                      <Input
                        id={`wa-tpl-ex-${n}`}
                        value={syncedExamples[n - 1] || ''}
                        onChange={(e) => {
                          const next = [...syncedExamples];
                          next[n - 1] = e.target.value;
                          setFormExamples(next);
                        }}
                        placeholder={DEFAULT_VAR_SAMPLES[n - 1] || `Sample ${n}`}
                        className="h-9 rounded-lg"
                      />
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="space-y-2 rounded-xl border border-slate-200 p-3">
              <p className="text-xs font-medium text-slate-700">Buttons (optional, max 3)</p>
              <div className="space-y-1.5">
                <Label htmlFor="wa-tpl-call">Call us phone</Label>
                <Input
                  id="wa-tpl-call"
                  value={formCallPhone}
                  onChange={(e) => setFormCallPhone(e.target.value)}
                  placeholder="8884944288 or 9880693311"
                  className="h-10 rounded-xl"
                />
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="wa-tpl-url-text">URL button label</Label>
                  <Input
                    id="wa-tpl-url-text"
                    value={formUrlText}
                    onChange={(e) => setFormUrlText(e.target.value)}
                    placeholder="Pay now / Website"
                    className="h-10 rounded-xl"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="wa-tpl-url">URL (https)</Label>
                  <Input
                    id="wa-tpl-url"
                    value={formUrl}
                    onChange={(e) => setFormUrl(e.target.value)}
                    placeholder="https://hydrogenro.com or …/p/{{1}}"
                    className="h-10 rounded-xl"
                  />
                </div>
              </div>
              {urlHasVar ? (
                <div className="space-y-1.5">
                  <Label htmlFor="wa-tpl-url-ex">URL sample for {'{{1}}'}</Label>
                  <Input
                    id="wa-tpl-url-ex"
                    value={formUrlExample}
                    onChange={(e) => setFormUrlExample(e.target.value)}
                    placeholder="pay123456"
                    className="h-10 rounded-xl font-mono text-sm"
                  />
                  <p className="text-[11px] text-slate-500">
                    Required when the URL ends with {'{{1}}'} (e.g. /p/{'{{1}}'}).
                  </p>
                </div>
              ) : null}
              <div className="space-y-1.5">
                <Label htmlFor="wa-tpl-qr">Quick reply</Label>
                <Input
                  id="wa-tpl-qr"
                  value={formQuickReply}
                  onChange={(e) => setFormQuickReply(e.target.value)}
                  placeholder="Book now"
                  maxLength={25}
                  className="h-10 rounded-xl"
                />
              </div>
              {buttonPreview.length ? (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {buttonPreview.map((b) => (
                    <span
                      key={b}
                      className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] text-slate-700"
                    >
                      {b}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-[11px] text-slate-400">No buttons</p>
              )}
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-3">
              <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                Preview
              </p>
              <pre className="whitespace-pre-wrap font-sans text-xs leading-relaxed text-slate-800">
                {fillWhatsAppTemplatePreview(formBody, syncedExamples)}
              </pre>
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              type="button"
              variant="outline"
              className="h-9 rounded-lg"
              onClick={() => setCreateOpen(false)}
              disabled={busy}
            >
              Cancel
            </Button>
            <Button
              type="button"
              className="h-9 rounded-lg bg-slate-900 hover:bg-slate-800"
              onClick={() => void handleCreate()}
              disabled={busy || !formName.trim() || formBody.trim().length < 10}
            >
              {busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Plus className="mr-1.5 h-4 w-4" />}
              Submit to Meta
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={Boolean(deleteName)} onOpenChange={(o) => !o && setDeleteName(null)}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete template?</AlertDialogTitle>
            <AlertDialogDescription>
              Permanently deletes{' '}
              <span className="font-mono font-medium text-foreground">{deleteName}</span> from Meta.
              The name may stay locked for a while.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy} className="rounded-lg">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              className="rounded-lg bg-rose-600 text-white hover:bg-rose-700"
              onClick={(e) => {
                e.preventDefault();
                void handleDelete();
              }}
            >
              {busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
