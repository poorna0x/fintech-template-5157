import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
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

export default function PrivacyCenterPage({ onBack }: { onBack?: () => void }) {
  const [tab, setTab] = useState<'requests' | 'consents' | 'audit'>('requests');
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
      toast.success('Updated');
      void loadRequests();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Update failed');
    }
  }

  return (
    <div className="space-y-4 p-4 max-w-4xl mx-auto">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold">Privacy Center</h1>
          <p className="text-sm text-muted-foreground">
            DSAR queue, consent register, security audit (180-day retention). Aim to acknowledge
            privacy requests within 72 hours and resolve within 30 days where legally required.
            For suspected breaches: preserve logs, contain access, notify counsel / CERT-In if your
            entity class requires it, and document actions in this audit log.
          </p>
        </div>
        {onBack ? (
          <Button type="button" variant="outline" size="sm" onClick={onBack}>
            Back
          </Button>
        ) : null}
      </div>

      <div className="flex gap-2 flex-wrap">
        {(
          [
            ['requests', 'Requests'],
            ['consents', 'Consents'],
            ['audit', 'Audit log'],
          ] as const
        ).map(([id, label]) => (
          <Button
            key={id}
            type="button"
            size="sm"
            variant={tab === id ? 'default' : 'outline'}
            onClick={() => setTab(id)}
          >
            {label}
          </Button>
        ))}
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={loading}
          onClick={() => {
            if (tab === 'requests') void loadRequests();
            if (tab === 'consents') void loadConsents();
            if (tab === 'audit') void loadAudit();
          }}
        >
          Refresh
        </Button>
      </div>

      {tab === 'requests' && (
        <div className="space-y-3">
          {requests.length === 0 && !loading ? (
            <p className="text-sm text-muted-foreground">No privacy requests yet.</p>
          ) : null}
          {requests.map((r) => (
            <Card key={r.id}>
              <CardHeader className="pb-2">
                <div className="flex flex-wrap items-center gap-2">
                  <CardTitle className="text-base capitalize">{r.request_type.replace('_', ' ')}</CardTitle>
                  <Badge variant="secondary">{r.status}</Badge>
                  <Badge variant="outline">{r.brand}</Badge>
                </div>
                <CardDescription>
                  {r.requester_name || '—'} · {r.requester_phone || '—'} · {r.requester_email || '—'}
                  <br />
                  SLA due {new Date(r.sla_due_at).toLocaleString()} · Opened{' '}
                  {new Date(r.created_at).toLocaleString()}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {r.details ? <p className="text-sm whitespace-pre-wrap">{r.details}</p> : null}
                <Textarea
                  placeholder="Admin notes"
                  value={notesDraft[r.id] ?? r.admin_notes ?? ''}
                  onChange={(e) => setNotesDraft((p) => ({ ...p, [r.id]: e.target.value }))}
                  rows={2}
                />
                <div className="flex flex-wrap gap-2">
                  <Button type="button" size="sm" variant="outline" onClick={() => updateRequest(r.id, 'in_progress')}>
                    In progress
                  </Button>
                  <Button type="button" size="sm" onClick={() => updateRequest(r.id, 'completed')}>
                    Complete
                  </Button>
                  <Button type="button" size="sm" variant="destructive" onClick={() => updateRequest(r.id, 'rejected')}>
                    Reject
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {tab === 'consents' && (
        <div className="overflow-x-auto rounded border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-left">
                <th className="p-2">When</th>
                <th className="p-2">Phone</th>
                <th className="p-2">Brand</th>
                <th className="p-2">Purpose</th>
                <th className="p-2">Notice</th>
                <th className="p-2">Granted</th>
              </tr>
            </thead>
            <tbody>
              {consents.map((c) => (
                <tr key={c.id} className="border-b">
                  <td className="p-2 whitespace-nowrap">{new Date(c.consented_at).toLocaleString()}</td>
                  <td className="p-2">{c.phone_e164 || '—'}</td>
                  <td className="p-2">{c.brand}</td>
                  <td className="p-2">{c.purpose}</td>
                  <td className="p-2">{c.notice_version}</td>
                  <td className="p-2">{c.granted ? 'yes' : 'no'}{c.withdrawn_at ? ' (withdrawn)' : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {consents.length === 0 && !loading ? (
            <p className="p-3 text-sm text-muted-foreground">No consent rows yet.</p>
          ) : null}
        </div>
      )}

      {tab === 'audit' && (
        <div className="overflow-x-auto rounded border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-left">
                <th className="p-2">When</th>
                <th className="p-2">Type</th>
                <th className="p-2">Action</th>
                <th className="p-2">Result</th>
                <th className="p-2">Actor</th>
              </tr>
            </thead>
            <tbody>
              {audits.map((a) => (
                <tr key={a.id} className="border-b">
                  <td className="p-2 whitespace-nowrap">{new Date(a.created_at).toLocaleString()}</td>
                  <td className="p-2">{a.event_type}</td>
                  <td className="p-2">{a.action}</td>
                  <td className="p-2">{a.result}</td>
                  <td className="p-2">{a.actor_email || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {audits.length === 0 && !loading ? (
            <p className="p-3 text-sm text-muted-foreground">No audit events yet.</p>
          ) : null}
        </div>
      )}
    </div>
  );
}
