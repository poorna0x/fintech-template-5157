import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import {
  ArrowLeft,
  ClipboardList,
  Clock3,
  ExternalLink,
  FileCheck2,
  Loader2,
  Mail,
  Phone,
  RefreshCw,
  ScrollText,
  ShieldCheck,
  UserRound,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { resolveSupabaseAccessTokenForApi } from '@/lib/ensureSupabaseSession';
import { supabase } from '@/lib/supabaseClient';

type PrivacyRequest = {
  id: string;
  request_type: string;
  status: string;
  brand: string;
  requester_name: string | null;
  requester_phone: string | null;
  requester_email: string | null;
  details: string | null;
  admin_notes: string | null;
  sla_due_at: string;
  completed_at: string | null;
  created_at: string;
};

type ConsentRow = {
  id: string;
  phone_e164: string | null;
  brand: string;
  purpose: string;
  notice_version: string;
  granted: boolean;
  consented_at: string;
  withdrawn_at: string | null;
};

type AuditRow = {
  id: number;
  event_type: string;
  action: string;
  result: string;
  actor_email: string | null;
  created_at: string;
};

type TabId = 'requests' | 'consents' | 'audit';

function formatWhen(iso: string) {
  try {
    return new Date(iso).toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function labelType(type: string) {
  return type.replace(/_/g, ' ');
}

function statusTone(status: string): string {
  switch (status) {
    case 'completed':
      return 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-200';
    case 'in_progress':
      return 'border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-900/50 dark:bg-sky-950/40 dark:text-sky-200';
    case 'rejected':
      return 'border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-200';
    default:
      return 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-100';
  }
}

function brandTone(brand: string): string {
  if (brand === 'elevenro') {
    return 'border-violet-200 bg-violet-50 text-violet-800 dark:border-violet-900/40 dark:bg-violet-950/30 dark:text-violet-200';
  }
  return 'border-teal-200 bg-teal-50 text-teal-800 dark:border-teal-900/40 dark:bg-teal-950/30 dark:text-teal-200';
}

function slaMeta(slaDueAt: string, status: string) {
  if (status === 'completed' || status === 'rejected') {
    return { label: 'Closed', className: 'text-muted-foreground' };
  }
  const due = new Date(slaDueAt).getTime();
  const now = Date.now();
  const hours = (due - now) / (1000 * 60 * 60);
  if (hours < 0) {
    return { label: `Overdue · due ${formatWhen(slaDueAt)}`, className: 'text-rose-600 dark:text-rose-400' };
  }
  if (hours < 24) {
    return { label: `Due soon · ${formatWhen(slaDueAt)}`, className: 'text-amber-700 dark:text-amber-300' };
  }
  return { label: `SLA ${formatWhen(slaDueAt)}`, className: 'text-muted-foreground' };
}

function EmptyState({
  icon: Icon,
  title,
  body,
}: {
  icon: typeof ShieldCheck;
  title: string;
  body: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed bg-muted/20 px-6 py-14 text-center">
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
        <Icon className="h-6 w-6" />
      </div>
      <p className="text-sm font-medium text-foreground">{title}</p>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">{body}</p>
    </div>
  );
}

export default function PrivacyCenterPage({ onBack }: { onBack?: () => void }) {
  const [tab, setTab] = useState<TabId>('requests');
  const [requests, setRequests] = useState<PrivacyRequest[]>([]);
  const [consents, setConsents] = useState<ConsentRow[]>([]);
  const [audits, setAudits] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [notesDraft, setNotesDraft] = useState<Record<string, string>>({});

  const authHeaders = useCallback(async () => {
    const token = await resolveSupabaseAccessTokenForApi();
    if (!token) throw new Error('Not signed in');
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    };
  }, []);

  const loadRequests = useCallback(async () => {
    setLoading(true);
    try {
      const headers = await authHeaders();
      const res = await fetch('/.netlify/functions/privacy-request', { headers });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Failed to load');
      setRequests(data.requests || []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load requests');
    } finally {
      setLoading(false);
    }
  }, [authHeaders]);

  const loadConsents = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('customer_consents')
        .select(
          'id,phone_e164,brand,purpose,notice_version,granted,consented_at,withdrawn_at'
        )
        .order('consented_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      setConsents((data as ConsentRow[]) || []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load consents');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadAudit = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('security_audit_events')
        .select('id,event_type,action,result,actor_email,created_at')
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      setAudits((data as AuditRow[]) || []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load audit log');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (tab === 'requests') void loadRequests();
    if (tab === 'consents') void loadConsents();
    if (tab === 'audit') void loadAudit();
  }, [tab, loadRequests, loadConsents, loadAudit]);

  // Prefetch counts for the summary cards when landing on Requests.
  useEffect(() => {
    void (async () => {
      try {
        const [{ data: c }, { data: a }] = await Promise.all([
          supabase
            .from('customer_consents')
            .select('id,phone_e164,brand,purpose,notice_version,granted,consented_at,withdrawn_at')
            .order('consented_at', { ascending: false })
            .limit(100),
          supabase
            .from('security_audit_events')
            .select('id,event_type,action,result,actor_email,created_at')
            .order('created_at', { ascending: false })
            .limit(100),
        ]);
        if (c) setConsents(c as ConsentRow[]);
        if (a) setAudits(a as AuditRow[]);
      } catch {
        /* soft */
      }
    })();
  }, []);

  async function updateRequest(id: string, status: string) {
    try {
      const headers = await authHeaders();
      const res = await fetch('/.netlify/functions/privacy-request', {
        method: 'PATCH',
        headers,
        body: JSON.stringify({
          id,
          status,
          admin_notes: notesDraft[id] ?? undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Update failed');
      toast.success('Request updated');
      void loadRequests();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Update failed');
    }
  }

  const openCount = useMemo(
    () => requests.filter((r) => r.status === 'open' || r.status === 'in_progress').length,
    [requests]
  );
  const overdueCount = useMemo(
    () =>
      requests.filter(
        (r) =>
          (r.status === 'open' || r.status === 'in_progress') &&
          new Date(r.sla_due_at).getTime() < Date.now()
      ).length,
    [requests]
  );

  const tabs: { id: TabId; label: string; count?: number; icon: typeof ClipboardList }[] = [
    { id: 'requests', label: 'Requests', count: requests.length, icon: ClipboardList },
    { id: 'consents', label: 'Consents', count: consents.length, icon: FileCheck2 },
    { id: 'audit', label: 'Audit log', count: audits.length, icon: ScrollText },
  ];

  function refresh() {
    if (tab === 'requests') void loadRequests();
    if (tab === 'consents') void loadConsents();
    if (tab === 'audit') void loadAudit();
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          {onBack ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="mt-0.5 shrink-0"
              onClick={onBack}
              aria-label="Back to settings"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
          ) : null}
          <div>
            <div className="flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Privacy Center</h1>
            </div>
            <p className="mt-1.5 max-w-2xl text-sm text-muted-foreground">
              Customer data requests for HydrogenRO &amp; ElevenRO, consent evidence, and security
              audit events.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 sm:justify-end">
          <Button type="button" variant="outline" size="sm" asChild>
            <Link to="/privacy-request" target="_blank" rel="noreferrer">
              Public form
              <ExternalLink className="ml-1.5 h-3.5 w-3.5" />
            </Link>
          </Button>
          <Button type="button" variant="outline" size="sm" disabled={loading} onClick={refresh}>
            {loading ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-1.5 h-4 w-4" />
            )}
            Refresh
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="border-border/80 shadow-none">
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-500/10 text-amber-700 dark:text-amber-300">
              <ClipboardList className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Open requests
              </p>
              <p className="text-2xl font-semibold tabular-nums">{openCount}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border/80 shadow-none">
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-rose-500/10 text-rose-700 dark:text-rose-300">
              <Clock3 className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Past 72h SLA
              </p>
              <p className="text-2xl font-semibold tabular-nums">{overdueCount}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border/80 shadow-none">
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-teal-500/10 text-teal-700 dark:text-teal-300">
              <FileCheck2 className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Consents logged
              </p>
              <p className="text-2xl font-semibold tabular-nums">{consents.length}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-border/80 bg-muted/30 shadow-none">
        <CardContent className="space-y-1 p-4 text-sm text-muted-foreground">
          <p>
            Acknowledge within <span className="font-medium text-foreground">72 hours</span>. Aim to
            resolve within 30 days where required. Audit events are retained 180 days.
          </p>
          <p className="text-xs">
            Suspected breach: preserve logs, contain access, notify counsel / CERT-In if applicable,
            and record actions in the audit log.
          </p>
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center gap-2 border-b pb-3">
        {tabs.map(({ id, label, count, icon: Icon }) => (
          <Button
            key={id}
            type="button"
            size="sm"
            variant={tab === id ? 'default' : 'ghost'}
            className={cn('gap-1.5', tab !== id && 'text-muted-foreground')}
            onClick={() => setTab(id)}
          >
            <Icon className="h-4 w-4" />
            {label}
            {typeof count === 'number' ? (
              <Badge
                variant="secondary"
                className={cn(
                  'ml-0.5 h-5 min-w-5 justify-center px-1.5 text-[11px]',
                  tab === id && 'bg-primary-foreground/20 text-primary-foreground'
                )}
              >
                {count}
              </Badge>
            ) : null}
          </Button>
        ))}
      </div>

      {loading && tab === 'requests' && requests.length === 0 ? (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading…
        </div>
      ) : null}

      {tab === 'requests' && (
        <div className="space-y-3">
          {!loading && requests.length === 0 ? (
            <EmptyState
              icon={ClipboardList}
              title="No privacy requests yet"
              body="When a customer submits /privacy-request, it appears here for both brands."
            />
          ) : null}
          {requests.map((r) => {
            const sla = slaMeta(r.sla_due_at, r.status);
            return (
              <Card key={r.id} className="overflow-hidden border-border/80 shadow-none">
                <CardHeader className="space-y-3 pb-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <CardTitle className="text-base capitalize">
                          {labelType(r.request_type)}
                        </CardTitle>
                        <Badge variant="outline" className={cn('capitalize', statusTone(r.status))}>
                          {r.status.replace(/_/g, ' ')}
                        </Badge>
                        <Badge variant="outline" className={cn('capitalize', brandTone(r.brand))}>
                          {r.brand}
                        </Badge>
                      </div>
                      <CardDescription className={cn('flex flex-wrap items-center gap-1.5 text-xs', sla.className)}>
                        <Clock3 className="h-3.5 w-3.5 shrink-0" />
                        {sla.label}
                        <span className="text-muted-foreground">· Opened {formatWhen(r.created_at)}</span>
                      </CardDescription>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-sm text-muted-foreground">
                    <span className="inline-flex items-center gap-1.5">
                      <UserRound className="h-3.5 w-3.5" />
                      {r.requester_name || 'No name'}
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <Phone className="h-3.5 w-3.5" />
                      {r.requester_phone || '—'}
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <Mail className="h-3.5 w-3.5" />
                      {r.requester_email || '—'}
                    </span>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3 border-t bg-muted/10 pt-4">
                  {r.details ? (
                    <div className="rounded-lg border bg-background px-3 py-2 text-sm whitespace-pre-wrap">
                      {r.details}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">No details provided.</p>
                  )}
                  <Textarea
                    placeholder="Admin notes (what you sent / how you verified identity)"
                    value={notesDraft[r.id] ?? r.admin_notes ?? ''}
                    onChange={(e) => setNotesDraft((p) => ({ ...p, [r.id]: e.target.value }))}
                    rows={2}
                    className="bg-background"
                  />
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => updateRequest(r.id, 'in_progress')}
                    >
                      In progress
                    </Button>
                    <Button type="button" size="sm" onClick={() => updateRequest(r.id, 'completed')}>
                      Complete
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="destructive"
                      onClick={() => updateRequest(r.id, 'rejected')}
                    >
                      Reject
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {tab === 'consents' && (
        <Card className="overflow-hidden border-border/80 shadow-none">
          {loading && consents.length === 0 ? (
            <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading…
            </div>
          ) : consents.length === 0 ? (
            <div className="p-4">
              <EmptyState
                icon={FileCheck2}
                title="No consent rows yet"
                body="Booking “I accept” checkboxes write consent evidence here after a successful book."
              />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-4 py-3 font-medium">When</th>
                    <th className="px-4 py-3 font-medium">Phone</th>
                    <th className="px-4 py-3 font-medium">Brand</th>
                    <th className="px-4 py-3 font-medium">Purpose</th>
                    <th className="px-4 py-3 font-medium">Notice</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {consents.map((c) => (
                    <tr key={c.id} className="border-b last:border-0 hover:bg-muted/30">
                      <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                        {formatWhen(c.consented_at)}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs sm:text-sm">
                        {c.phone_e164 || '—'}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant="outline" className={cn('capitalize', brandTone(c.brand))}>
                          {c.brand}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 capitalize">{c.purpose.replace(/_/g, ' ')}</td>
                      <td className="px-4 py-3 font-mono text-xs">{c.notice_version}</td>
                      <td className="px-4 py-3">
                        {c.withdrawn_at ? (
                          <Badge variant="outline" className="border-rose-200 bg-rose-50 text-rose-800">
                            Withdrawn
                          </Badge>
                        ) : c.granted ? (
                          <Badge
                            variant="outline"
                            className="border-emerald-200 bg-emerald-50 text-emerald-800"
                          >
                            Granted
                          </Badge>
                        ) : (
                          <Badge variant="secondary">Denied</Badge>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {tab === 'audit' && (
        <Card className="overflow-hidden border-border/80 shadow-none">
          {loading && audits.length === 0 ? (
            <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading…
            </div>
          ) : audits.length === 0 ? (
            <div className="p-4">
              <EmptyState
                icon={ScrollText}
                title="No audit events yet"
                body="Bookings, privacy submits, and admin updates write light security audit rows here."
              />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-4 py-3 font-medium">When</th>
                    <th className="px-4 py-3 font-medium">Type</th>
                    <th className="px-4 py-3 font-medium">Action</th>
                    <th className="px-4 py-3 font-medium">Result</th>
                    <th className="px-4 py-3 font-medium">Actor</th>
                  </tr>
                </thead>
                <tbody>
                  {audits.map((a) => (
                    <tr key={a.id} className="border-b last:border-0 hover:bg-muted/30">
                      <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                        {formatWhen(a.created_at)}
                      </td>
                      <td className="px-4 py-3 capitalize">{a.event_type}</td>
                      <td className="px-4 py-3 font-mono text-xs sm:text-sm">{a.action}</td>
                      <td className="px-4 py-3">
                        <Badge
                          variant="outline"
                          className={cn(
                            'capitalize',
                            a.result === 'ok'
                              ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                              : 'border-amber-200 bg-amber-50 text-amber-900'
                          )}
                        >
                          {a.result}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{a.actor_email || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
