import { supabase } from '@/lib/supabaseClient';
import type { DocumentBrand } from '@/lib/service-brands';
import { normalizeDocumentBrand } from '@/lib/service-brands';

export type JobReviewInvite = {
  ok: true;
  token: string;
  brand: DocumentBrand;
  url: string;
  alreadySubmitted?: boolean;
  skipped?: boolean;
  reason?: string;
};

export function jobHasSkipReview(job: Record<string, unknown> | null | undefined): boolean {
  if (!job) return false;
  const raw = job.requirements ?? (job as { Requirements?: unknown }).Requirements;
  let list: unknown[] = [];
  if (Array.isArray(raw)) list = raw;
  else if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) list = parsed;
    } catch {
      return false;
    }
  }
  return list.some((entry) => entry && typeof entry === 'object' && (entry as { skip_review?: unknown }).skip_review === true);
}

export function jobReviewPublicUrl(token: string, brand: DocumentBrand): string {
  const t = String(token || '').trim();
  if (!t) return '';
  const host = brand === 'elevenro' ? 'https://elevenro.com' : 'https://hydrogenro.com';
  if (typeof window !== 'undefined' && /localhost|127\.0\.0\.1/.test(window.location.hostname)) {
    return `${window.location.origin}/review/${encodeURIComponent(t)}`;
  }
  return `${host}/review/${encodeURIComponent(t)}`;
}

export function brandGoogleReviewUrl(brand: DocumentBrand): string {
  if (brand === 'elevenro') {
    return 'https://www.google.com/maps/search/?api=1&query=Eleven+RO+Anjanapura+Bengaluru';
  }
  return 'https://www.google.com/maps/search/?api=1&query=Hydrogen+RO+Seshadripuram+Bengaluru';
}

function parseInvitePayload(data: unknown): JobReviewInvite | null {
  const row = data && typeof data === 'object' ? (data as Record<string, unknown>) : null;
  if (!row || row.ok !== true) return null;
  if (row.skipped === true) {
    return {
      ok: true,
      token: '',
      brand: 'hydrogenro',
      url: '',
      skipped: true,
      reason: String(row.reason || 'skipped'),
    };
  }
  const token = String(row.token || '').trim();
  const brand = normalizeDocumentBrand(row.brand) || 'hydrogenro';
  if (!token) return null;
  return {
    ok: true,
    token,
    brand,
    url: jobReviewPublicUrl(token, brand),
    alreadySubmitted: row.already_submitted === true,
  };
}

export async function createJobReviewInvite(opts: {
  jobId: string;
  technicianId?: string | null;
}): Promise<JobReviewInvite | null> {
  const jobId = String(opts.jobId || '').trim();
  if (!jobId) return null;
  try {
    const { data, error } = await supabase.rpc('create_job_review_invite', {
      p_job_id: jobId,
      p_technician_id: opts.technicianId || null,
    });
    if (error) {
      console.warn('[job-review] create failed', error.message);
      return null;
    }
    return parseInvitePayload(data);
  } catch (err) {
    console.warn('[job-review] create error', err);
    return null;
  }
}

export type PublicJobReviewInvite = {
  brand: DocumentBrand;
  status: 'pending' | 'submitted';
  rating: number | null;
  technicianFirstName: string | null;
};

export async function fetchPublicJobReviewInvite(token: string): Promise<{
  invite: PublicJobReviewInvite | null;
  error?: 'invalid' | 'not_found' | 'expired' | 'failed';
}> {
  const t = String(token || '').trim();
  if (!t) return { invite: null, error: 'invalid' };
  try {
    const { data, error } = await supabase.rpc('get_job_review_invite', { p_token: t });
    if (error) {
      console.warn('[job-review] get failed', error.message);
      return { invite: null, error: 'failed' };
    }
    const row = data && typeof data === 'object' ? (data as Record<string, unknown>) : null;
    if (!row || row.ok !== true) {
      const code = String(row?.error || 'not_found');
      if (code === 'expired' || code === 'invalid' || code === 'not_found') {
        return { invite: null, error: code };
      }
      return { invite: null, error: 'failed' };
    }
    const brand = normalizeDocumentBrand(row.brand) || 'hydrogenro';
    const status = row.status === 'submitted' ? 'submitted' : 'pending';
    const ratingRaw = Number(row.rating);
    const rating = Number.isInteger(ratingRaw) && ratingRaw >= 1 && ratingRaw <= 5 ? ratingRaw : null;
    const technicianFirstName =
      typeof row.technician_first_name === 'string' && row.technician_first_name.trim()
        ? row.technician_first_name.trim()
        : null;
    return { invite: { brand, status, rating, technicianFirstName } };
  } catch (err) {
    console.warn('[job-review] get error', err);
    return { invite: null, error: 'failed' };
  }
}

export async function submitPublicJobReview(opts: {
  token: string;
  rating: number;
  comment?: string;
}): Promise<{ ok: boolean; alreadySubmitted?: boolean; error?: string }> {
  const token = String(opts.token || '').trim();
  const rating = Math.round(Number(opts.rating));
  if (!token || rating < 1 || rating > 5) return { ok: false, error: 'invalid' };
  try {
    const { data, error } = await supabase.rpc('submit_job_review', {
      p_token: token,
      p_rating: rating,
      p_comment: String(opts.comment || '').trim().slice(0, 1000),
    });
    if (error) {
      console.warn('[job-review] submit failed', error.message);
      return { ok: false, error: error.message };
    }
    const row = data && typeof data === 'object' ? (data as Record<string, unknown>) : null;
    if (!row || row.ok !== true) {
      return { ok: false, error: String(row?.error || 'failed') };
    }
    return { ok: true, alreadySubmitted: row.already_submitted === true };
  } catch (err) {
    console.warn('[job-review] submit error', err);
    return { ok: false, error: 'failed' };
  }
}

export type JobReviewListRow = {
  id: string;
  rating: number;
  comment: string;
  brand: DocumentBrand;
  submittedAt: string;
  technicianId: string | null;
  technicianName: string;
  customerName: string;
  jobId: string;
};

export type JobReviewTechStat = {
  technicianId: string | null;
  technicianName: string;
  count: number;
  avg: number;
};

function mapReviewListRow(raw: Record<string, unknown>): JobReviewListRow {
  const tech = raw.technicians as { full_name?: string } | { full_name?: string }[] | null;
  const cust = raw.customers as { full_name?: string } | { full_name?: string }[] | null;
  const techObj = Array.isArray(tech) ? tech[0] : tech;
  const custObj = Array.isArray(cust) ? cust[0] : cust;
  const rating = Number(raw.rating) || 0;
  return {
    id: String(raw.id),
    rating,
    comment: String(raw.comment || ''),
    brand: normalizeDocumentBrand(raw.brand) || 'hydrogenro',
    submittedAt: String(raw.submitted_at || ''),
    technicianId: raw.technician_id ? String(raw.technician_id) : null,
    technicianName: String(techObj?.full_name || 'Technician'),
    customerName: String(custObj?.full_name || 'Customer'),
    jobId: String(raw.job_id || ''),
  };
}

const REVIEW_LIST_SELECT =
  'id, rating, comment, brand, submitted_at, technician_id, job_id, technicians(full_name), customers(full_name)';

export async function fetchSubmittedJobReviewsPage(opts: {
  page: number;
  pageSize: number;
  technicianId?: string | null;
  brand?: DocumentBrand | 'all';
}): Promise<{ rows: JobReviewListRow[]; total: number }> {
  const pageSize = Math.min(50, Math.max(10, Math.round(opts.pageSize) || 20));
  const page = Math.max(1, Math.round(opts.page) || 1);
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from('job_reviews')
    .select(REVIEW_LIST_SELECT, { count: 'exact' })
    .eq('status', 'submitted')
    .order('submitted_at', { ascending: false })
    .range(from, to);

  if (opts.technicianId) {
    query = query.eq('technician_id', opts.technicianId);
  }
  if (opts.brand && opts.brand !== 'all') {
    query = query.eq('brand', opts.brand);
  }

  const { data, error, count } = await query;
  if (error) {
    console.warn('[job-review] list page failed', error.message);
    return { rows: [], total: 0 };
  }
  const rows = (Array.isArray(data) ? data : []).map((raw) =>
    mapReviewListRow(raw as Record<string, unknown>)
  );
  return { rows, total: typeof count === 'number' ? count : rows.length };
}

const STATS_CACHE_KEY = 'job_review_tech_stats_v1';
const STATS_TTL_MS = 60 * 1000;

export async function fetchJobReviewTechnicianStats(opts?: {
  force?: boolean;
}): Promise<{ total: number; technicians: JobReviewTechStat[] }> {
  if (!opts?.force && typeof sessionStorage !== 'undefined') {
    try {
      const raw = sessionStorage.getItem(STATS_CACHE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as {
          at?: number;
          total?: number;
          technicians?: JobReviewTechStat[];
        };
        if (parsed?.at && Date.now() - parsed.at < STATS_TTL_MS && Array.isArray(parsed.technicians)) {
          return { total: Number(parsed.total) || 0, technicians: parsed.technicians };
        }
      }
    } catch {
      /* ignore */
    }
  }

  const { data, error } = await supabase.rpc('job_review_technician_stats');
  if (!error && data && typeof data === 'object') {
    const row = data as Record<string, unknown>;
    const technicians = (Array.isArray(row.technicians) ? row.technicians : []).map((item) => {
      const t = item as Record<string, unknown>;
      return {
        technicianId: t.technician_id ? String(t.technician_id) : null,
        technicianName: String(t.technician_name || 'Technician'),
        count: Number(t.review_count) || 0,
        avg: Number(t.avg_rating) || 0,
      } satisfies JobReviewTechStat;
    });
    const result = { total: Number(row.total) || 0, technicians };
    try {
      sessionStorage.setItem(STATS_CACHE_KEY, JSON.stringify({ at: Date.now(), ...result }));
    } catch {
      /* ignore */
    }
    return result;
  }

  const { data: slim, error: slimErr } = await supabase
    .from('job_reviews')
    .select('technician_id, rating, technicians(full_name)')
    .eq('status', 'submitted')
    .limit(2000);
  if (slimErr) {
    console.warn('[job-review] stats rpc failed', error?.message || slimErr.message);
    return { total: 0, technicians: [] };
  }
  const byTech = new Map<string, { name: string; ratings: number[] }>();
  for (const raw of Array.isArray(slim) ? slim : []) {
    const row = raw as Record<string, unknown>;
    const tech = row.technicians as { full_name?: string } | { full_name?: string }[] | null;
    const techObj = Array.isArray(tech) ? tech[0] : tech;
    const tid = row.technician_id ? String(row.technician_id) : 'none';
    const cur = byTech.get(tid) || {
      name: String(techObj?.full_name || 'Technician'),
      ratings: [],
    };
    cur.ratings.push(Number(row.rating) || 0);
    byTech.set(tid, cur);
  }
  const technicians: JobReviewTechStat[] = [...byTech.entries()]
    .map(([id, v]) => ({
      technicianId: id === 'none' ? null : id,
      technicianName: v.name,
      count: v.ratings.length,
      avg: v.ratings.reduce((a, b) => a + b, 0) / v.ratings.length,
    }))
    .sort((a, b) => b.avg - a.avg || b.count - a.count);
  const result = {
    total: technicians.reduce((n, t) => n + t.count, 0),
    technicians,
  };
  try {
    sessionStorage.setItem(STATS_CACHE_KEY, JSON.stringify({ at: Date.now(), ...result }));
  } catch {
    /* ignore */
  }
  return result;
}

export async function fetchSubmittedJobReviewRatingsByJobIds(
  jobIds: string[]
): Promise<Record<string, number>> {
  const ids = [...new Set(jobIds.map((id) => String(id || '').trim()).filter(Boolean))];
  if (ids.length === 0) return {};
  const { data, error } = await supabase
    .from('job_reviews')
    .select('job_id, rating')
    .eq('status', 'submitted')
    .in('job_id', ids);
  if (error) {
    console.warn('[job-review] ratings by job failed', error.message);
    return {};
  }
  const map: Record<string, number> = {};
  for (const raw of Array.isArray(data) ? data : []) {
    const row = raw as { job_id?: string; rating?: number };
    const id = String(row.job_id || '');
    const rating = Number(row.rating);
    if (id && Number.isInteger(rating) && rating >= 1 && rating <= 5) {
      map[id] = rating;
    }
  }
  return map;
}

/** Public page — notify admin phones after a successful submit (soft-fail). */
export function notifyAdminsJobReviewSubmitted(token: string): void {
  const t = String(token || '').trim();
  if (!t) return;
  const host =
    typeof window !== 'undefined' ? window.location.hostname.toLowerCase() : '';
  const url =
    host.includes('elevenro')
      ? 'https://hydrogenro.com/.netlify/functions/job-review-notify'
      : '/.netlify/functions/job-review-notify';
  void fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: t }),
    keepalive: true,
  }).catch(() => {
    /* ignore */
  });
}
