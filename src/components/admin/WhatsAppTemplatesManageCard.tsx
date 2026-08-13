import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Loader2,
  Plus,
  RefreshCw,
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
  type WhatsAppManagedTemplate,
  type WhatsAppTemplateCounts,
} from '@/lib/whatsappTemplateManage';

function statusBadgeClass(status: string): string {
  switch (String(status || '').toUpperCase()) {
    case 'APPROVED':
      return 'bg-emerald-100 text-emerald-800 border-emerald-200';
    case 'PENDING':
      return 'bg-amber-100 text-amber-900 border-amber-200';
    case 'REJECTED':
      return 'bg-red-100 text-red-800 border-red-200';
    default:
      return 'bg-muted text-muted-foreground';
  }
}

function brandHint(name: string): string {
  if (/_hro/i.test(name)) return 'HRO';
  if (/_ero/i.test(name)) return 'ERO';
  return '';
}

function countPlaceholders(body: string): number {
  const set = new Set<number>();
  const re = /\{\{(\d+)\}\}/g;
  let m;
  while ((m = re.exec(body)) !== null) set.add(Number(m[1]));
  return set.size;
}

export default function WhatsAppTemplatesManageCard() {
  const [loading, setLoading] = useState(true);
  const [templates, setTemplates] = useState<WhatsAppManagedTemplate[]>([]);
  const [counts, setCounts] = useState<WhatsAppTemplateCounts | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'APPROVED' | 'PENDING' | 'REJECTED'>(
    'ALL'
  );
  const [expanded, setExpanded] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteName, setDeleteName] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [formName, setFormName] = useState('');
  const [formBody, setFormBody] = useState(
    'Hi {{1}}, this is an update from Hydrogen RO regarding your service.'
  );
  const [formExamples, setFormExamples] = useState('Rahul');
  const [formCallPhone, setFormCallPhone] = useState('8884944288');
  const [formUrl, setFormUrl] = useState('');
  const [formUrlText, setFormUrlText] = useState('Website');
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
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

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
      const examples = formExamples
        .split('|')
        .map((s) => s.trim())
        .filter(Boolean);
      const result = await createWhatsAppTemplate({
        name: formName,
        body: formBody,
        examples,
        callPhone: formCallPhone.trim() || undefined,
        urlButtonUrl: formUrl.trim() || undefined,
        urlButtonText: formUrlText.trim() || 'Website',
        quickReply: formQuickReply.trim() || undefined,
      });
      if (!result.ok) {
        toast.error(result.error || 'Create failed');
        return;
      }
      toast.success(`Submitted ${result.name} (${result.status || 'PENDING'})`);
      setCreateOpen(false);
      setFormName('');
      await load();
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
      if (expanded === deleteName) setExpanded(null);
      await load();
    } finally {
      setBusy(false);
    }
  };

  const placeholderCount = countPlaceholders(formBody);

  return (
    <>
      <Card>
        <CardHeader className="pb-2">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <CardTitle className="text-base">Meta templates</CardTitle>
              <CardDescription>
                View all WhatsApp Business templates, preview copy, submit new UTILITY templates, or
                delete. IMAGE/DOCUMENT headers still need the submit script.
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 gap-1.5"
                onClick={() => void load()}
                disabled={loading || busy}
              >
                {loading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="h-3.5 w-3.5" />
                )}
                Refresh
              </Button>
              <Button
                type="button"
                size="sm"
                className="h-8 gap-1.5"
                onClick={() => setCreateOpen(true)}
                disabled={busy}
              >
                <Plus className="h-3.5 w-3.5" />
                New
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {counts ? (
            <div className="flex flex-wrap gap-2 text-[11px]">
              <Badge variant="secondary">{counts.total} total</Badge>
              <Badge className={cn('border', statusBadgeClass('APPROVED'))}>
                {counts.approved} approved
              </Badge>
              <Badge className={cn('border', statusBadgeClass('PENDING'))}>
                {counts.pending} pending
              </Badge>
              <Badge className={cn('border', statusBadgeClass('REJECTED'))}>
                {counts.rejected} rejected
              </Badge>
            </div>
          ) : null}

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search name or body…"
              className="h-9"
            />
            <div className="flex flex-wrap gap-1.5">
              {(['ALL', 'APPROVED', 'PENDING', 'REJECTED'] as const).map((s) => (
                <Button
                  key={s}
                  type="button"
                  size="sm"
                  variant={statusFilter === s ? 'default' : 'outline'}
                  className="h-8 px-2.5 text-xs"
                  onClick={() => setStatusFilter(s)}
                >
                  {s === 'ALL' ? 'All' : s.charAt(0) + s.slice(1).toLowerCase()}
                </Button>
              ))}
            </div>
          </div>

          {error ? (
            <p className="text-sm text-destructive">{error}</p>
          ) : loading && !templates.length ? (
            <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading templates from Meta…
            </div>
          ) : filtered.length === 0 ? (
            <p className="py-4 text-sm text-muted-foreground">No templates match.</p>
          ) : (
            <ul className="max-h-[28rem] divide-y overflow-y-auto rounded-md border">
              {filtered.map((t) => {
                const key = `${t.name}:${t.language}`;
                const open = expanded === key;
                const brand = brandHint(t.name);
                return (
                  <li key={key} className="bg-background">
                    <button
                      type="button"
                      className="flex w-full items-start gap-2 px-3 py-2.5 text-left hover:bg-muted/40"
                      onClick={() => setExpanded(open ? null : key)}
                    >
                      {open ? (
                        <ChevronDown className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="truncate font-mono text-xs font-medium text-foreground">
                            {t.name}
                          </span>
                          {brand ? (
                            <Badge variant="outline" className="h-5 px-1.5 text-[10px]">
                              {brand}
                            </Badge>
                          ) : null}
                          <Badge className={cn('h-5 border px-1.5 text-[10px]', statusBadgeClass(t.status))}>
                            {t.status}
                          </Badge>
                          {t.category ? (
                            <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
                              {t.category}
                            </Badge>
                          ) : null}
                          {t.header?.format ? (
                            <Badge variant="outline" className="h-5 px-1.5 text-[10px]">
                              {t.header.format}
                            </Badge>
                          ) : null}
                        </div>
                        {!open && t.bodyPreview ? (
                          <p className="mt-0.5 line-clamp-1 text-[11px] text-muted-foreground">
                            {t.bodyPreview}
                          </p>
                        ) : null}
                      </div>
                    </button>
                    {open ? (
                      <div className="space-y-2 border-t bg-muted/20 px-3 py-3">
                        <pre className="whitespace-pre-wrap rounded-md border bg-background p-3 font-sans text-xs leading-relaxed text-foreground">
                          {fillWhatsAppTemplatePreview(t.bodyPreview)}
                        </pre>
                        {t.buttons?.length ? (
                          <div className="flex flex-wrap gap-1.5">
                            {t.buttons.map((b, i) => (
                              <Badge key={`${b.type}-${i}`} variant="outline" className="text-[10px]">
                                {b.type === 'PHONE_NUMBER'
                                  ? `Call: ${b.text || 'Call us'}${b.phone ? ` (${b.phone})` : ''}`
                                  : b.type === 'URL'
                                    ? `URL: ${b.text || 'Open'}`
                                    : b.type === 'QUICK_REPLY'
                                      ? `Reply: ${b.text}`
                                      : `${b.type}: ${b.text || ''}`}
                              </Badge>
                            ))}
                          </div>
                        ) : (
                          <p className="text-[11px] text-muted-foreground">No buttons</p>
                        )}
                        <div className="flex justify-end">
                          <Button
                            type="button"
                            variant="destructive"
                            size="sm"
                            className="h-8 gap-1.5"
                            disabled={busy}
                            onClick={() => setDeleteName(t.name)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
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
        </CardContent>
      </Card>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>New Meta template</DialogTitle>
            <DialogDescription>
              Submits a UTILITY template to Meta. Approval can take hours. Use {'{{1}}'}, {'{{2}}'}…
              for variables. IMAGE/DOCUMENT headers are not supported here yet.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <div className="space-y-1.5">
              <Label htmlFor="wa-tpl-name">Name</Label>
              <Input
                id="wa-tpl-name"
                value={formName}
                onChange={(e) => setFormName(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_'))}
                placeholder="svc_custom_notice_hro_v1"
                className="font-mono text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="wa-tpl-body">Body</Label>
              <Textarea
                id="wa-tpl-body"
                value={formBody}
                onChange={(e) => setFormBody(e.target.value)}
                rows={8}
                className="text-sm"
              />
            </div>
            {placeholderCount > 0 ? (
              <div className="space-y-1.5">
                <Label htmlFor="wa-tpl-ex">
                  Sample values ({placeholderCount} vars, separate with |)
                </Label>
                <Input
                  id="wa-tpl-ex"
                  value={formExamples}
                  onChange={(e) => setFormExamples(e.target.value)}
                  placeholder="Rahul|500|15 Aug 2026"
                />
              </div>
            ) : null}
            <div className="space-y-1.5">
              <Label htmlFor="wa-tpl-call">Call us phone (optional)</Label>
              <Input
                id="wa-tpl-call"
                value={formCallPhone}
                onChange={(e) => setFormCallPhone(e.target.value)}
                placeholder="8884944288 or 9880693311"
              />
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="wa-tpl-url-text">URL button label</Label>
                <Input
                  id="wa-tpl-url-text"
                  value={formUrlText}
                  onChange={(e) => setFormUrlText(e.target.value)}
                  placeholder="Website"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="wa-tpl-url">URL (https)</Label>
                <Input
                  id="wa-tpl-url"
                  value={formUrl}
                  onChange={(e) => setFormUrl(e.target.value)}
                  placeholder="https://hydrogenro.com"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="wa-tpl-qr">Quick reply (optional)</Label>
              <Input
                id="wa-tpl-qr"
                value={formQuickReply}
                onChange={(e) => setFormQuickReply(e.target.value)}
                placeholder="Book now"
                maxLength={25}
              />
            </div>
            <div className="rounded-md border bg-muted/30 p-3">
              <p className="mb-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                Preview
              </p>
              <pre className="whitespace-pre-wrap font-sans text-xs leading-relaxed">
                {fillWhatsAppTemplatePreview(
                  formBody,
                  formExamples.split('|').map((s) => s.trim())
                )}
              </pre>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setCreateOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button type="button" onClick={() => void handleCreate()} disabled={busy || !formName.trim()}>
              {busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
              Submit to Meta
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={Boolean(deleteName)} onOpenChange={(o) => !o && setDeleteName(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete template?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes <span className="font-mono font-medium">{deleteName}</span> from
              Meta. The name may be locked for reuse for a while. CRM code that still references it
              will fall back or fail until updated.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
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
