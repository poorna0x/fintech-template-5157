import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Briefcase, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
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
import { resolveSupabaseAccessTokenForApi } from '@/lib/ensureSupabaseSession';

type ApplicationStatus = 'new' | 'contacted' | 'hired' | 'not_selected';

type JobApplication = {
  id: string;
  created_at: string;
  full_name: string;
  phone: string;
  email: string | null;
  area: string;
  experience: 'fresher' | 'experienced';
  experience_detail: string | null;
  education: string;
  has_two_wheeler: boolean;
  has_licence: boolean;
  field_work_ok: boolean;
  note: string | null;
  status: ApplicationStatus;
  admin_notes: string | null;
};

const STATUS_LABELS: Record<ApplicationStatus, string> = {
  new: 'New',
  contacted: 'Contacted',
  hired: 'Hired',
  not_selected: 'Not selected',
};

const EDUCATION_LABELS: Record<string, string> = {
  iti: 'ITI',
  diploma: 'Diploma / Polytechnic',
  electrical: 'Electrical',
  electronics: 'Electronics',
  mechanical: 'Mechanical',
  plumbing: 'Plumbing',
  other: 'Other technical',
  none: 'No technical course',
};

const FILTERS: Array<{ id: 'all' | ApplicationStatus; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'new', label: 'New' },
  { id: 'contacted', label: 'Contacted' },
  { id: 'hired', label: 'Hired' },
  { id: 'not_selected', label: 'Not selected' },
];

function formatWhen(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });
}

async function authHeaders() {
  const token = await resolveSupabaseAccessTokenForApi();
  if (!token) throw new Error('Not signed in');
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };
}

type Props = {
  onBack?: () => void;
};

const JobApplicationsPage = ({ onBack }: Props) => {
  const [openHiring, setOpenHiring] = useState(false);
  const [missing, setMissing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [savingHiring, setSavingHiring] = useState(false);
  const [rows, setRows] = useState<JobApplication[]>([]);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]['id']>('all');
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const headers = await authHeaders();
      const res = await fetch('/.netlify/functions/job-application', {
        method: 'POST',
        headers,
        body: JSON.stringify({ action: 'list' }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not load applications');
      setOpenHiring(data.open === true);
      setMissing(data.missing === true);
      setRows(Array.isArray(data.applications) ? data.applications : []);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not load applications');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const visible = useMemo(
    () => (filter === 'all' ? rows : rows.filter((row) => row.status === filter)),
    [filter, rows]
  );

  const setHiring = async (next: boolean) => {
    setSavingHiring(true);
    const previous = openHiring;
    setOpenHiring(next);
    try {
      const headers = await authHeaders();
      const res = await fetch('/.netlify/functions/job-application', {
        method: 'POST',
        headers,
        body: JSON.stringify({ action: 'hiring', open: next }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not update hiring');
      setOpenHiring(data.open === true);
      toast.success(data.open ? 'Careers page is open for applications' : 'Careers page is closed');
    } catch (err) {
      setOpenHiring(previous);
      toast.error(err instanceof Error ? err.message : 'Could not update hiring');
    } finally {
      setSavingHiring(false);
    }
  };

  const updateStatus = async (id: string, status: ApplicationStatus) => {
    const previous = rows;
    setRows((current) => current.map((row) => (row.id === id ? { ...row, status } : row)));
    try {
      const headers = await authHeaders();
      const res = await fetch('/.netlify/functions/job-application', {
        method: 'POST',
        headers,
        body: JSON.stringify({ action: 'update', id, status }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not update');
    } catch (err) {
      setRows(previous);
      toast.error(err instanceof Error ? err.message : 'Could not update');
    }
  };

  const remove = async () => {
    if (!deleteId) return;
    const id = deleteId;
    setDeleteId(null);
    const previous = rows;
    setRows((current) => current.filter((row) => row.id !== id));
    try {
      const headers = await authHeaders();
      const res = await fetch('/.netlify/functions/job-application', {
        method: 'POST',
        headers,
        body: JSON.stringify({ action: 'delete', id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not delete');
    } catch (err) {
      setRows(previous);
      toast.error(err instanceof Error ? err.message : 'Could not delete');
    }
  };

  return (
    <div className="min-h-[100dvh] bg-background">
      <div className="sticky top-0 z-10 border-b border-border bg-card/95 backdrop-blur-sm">
        <div className="mx-auto flex max-w-lg items-center gap-2 px-4 py-3">
          <Button variant="ghost" size="sm" onClick={onBack} className="-ml-2 text-muted-foreground">
            <ArrowLeft className="mr-1 h-4 w-4" />
            Back
          </Button>
          <div className="min-w-0">
            <h1 className="truncate text-lg font-semibold text-foreground">Job applications</h1>
            <p className="truncate text-xs text-muted-foreground">Eleven RO careers</p>
          </div>
        </div>
      </div>

      <div className="mx-auto w-full max-w-lg space-y-4 px-4 py-4 pb-16">
        <section className="rounded-2xl border border-border bg-card p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <Briefcase className="h-4 w-4 text-sky-700" />
                <p className="text-sm font-semibold text-foreground">Accepting applications</p>
              </div>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                {openHiring
                  ? 'elevenro.com/careers shows the job and the apply form.'
                  : 'The page says we are not looking for new hires right now.'}
              </p>
            </div>
            <Switch
              checked={openHiring}
              disabled={savingHiring || missing || loading}
              onCheckedChange={(checked) => void setHiring(checked)}
              aria-label="Accepting applications"
            />
          </div>
          {missing ? (
            <p className="mt-3 text-sm text-destructive">
              Run scripts/add-elevenro-job-applications.sql in Supabase, then refresh.
            </p>
          ) : null}
        </section>

        <div className="flex gap-2 overflow-x-auto pb-1">
          {FILTERS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setFilter(item.id)}
              className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium ${
                filter === item.id
                  ? 'bg-foreground text-background'
                  : 'bg-muted text-muted-foreground'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        {loading ? <p className="text-sm text-muted-foreground">Loading…</p> : null}

        {!loading && visible.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
            {rows.length === 0 ? 'No applications yet.' : 'Nothing in this filter.'}
          </p>
        ) : null}

        <ul className="space-y-3">
          {visible.map((row) => {
            const wa = `https://wa.me/91${row.phone}`;
            return (
              <li key={row.id} className="rounded-2xl border border-border bg-card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-base font-semibold text-foreground">{row.full_name}</p>
                    <p className="text-xs text-muted-foreground">{formatWhen(row.created_at)}</p>
                  </div>
                  <button
                    type="button"
                    className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-destructive"
                    aria-label={`Delete ${row.full_name}`}
                    onClick={() => setDeleteId(row.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                <p className="mt-2 text-sm text-foreground">
                  <a className="font-medium underline-offset-2 hover:underline" href={`tel:+91${row.phone}`}>
                    {row.phone}
                  </a>
                  <span className="text-muted-foreground"> · </span>
                  <a className="underline-offset-2 hover:underline" href={wa} target="_blank" rel="noreferrer">
                    WhatsApp
                  </a>
                </p>
                {row.email ? <p className="text-sm text-muted-foreground">{row.email}</p> : null}
                <p className="mt-2 text-sm text-foreground">{row.area}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {row.experience === 'fresher' ? 'Fresher' : 'Experienced'}
                  {row.experience_detail ? ` · ${row.experience_detail}` : ''}
                  {' · '}
                  {EDUCATION_LABELS[row.education] || row.education}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  2-wheeler {row.has_two_wheeler ? 'yes' : 'no'}
                  {' · '}
                  Licence {row.has_licence ? 'yes' : 'no'}
                  {' · '}
                  Field work {row.field_work_ok ? 'yes' : 'no'}
                </p>
                {row.note ? <p className="mt-2 text-sm leading-relaxed text-foreground">{row.note}</p> : null}
                <label className="mt-3 block">
                  <span className="sr-only">Status for {row.full_name}</span>
                  <select
                    value={row.status}
                    onChange={(e) => void updateStatus(row.id, e.target.value as ApplicationStatus)}
                    className="h-10 w-full rounded-xl border border-input bg-background px-3 text-sm"
                  >
                    {(Object.keys(STATUS_LABELS) as ApplicationStatus[]).map((status) => (
                      <option key={status} value={status}>
                        {STATUS_LABELS[status]}
                      </option>
                    ))}
                  </select>
                </label>
              </li>
            );
          })}
        </ul>
      </div>

      <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this application?</AlertDialogTitle>
            <AlertDialogDescription>
              The name and phone will be removed from this list.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void remove()} className="bg-red-600 hover:bg-red-700">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default JobApplicationsPage;
