import { supabase } from '@/lib/supabaseClient';
import { isSupabaseConfigured, supabaseAnonKey, supabaseUrl } from '@/lib/supabaseConfig';
import { resolveSupabaseAccessTokenForApi } from '@/lib/ensureSupabaseSession';
import type { DocumentBrand } from '@/lib/service-brands';
import { getDocumentBrandLabel, normalizeDocumentBrand } from '@/lib/service-brands';
import { sendAdminWhatsAppTemplate, sendAdminWhatsAppText } from '@/lib/sendAdminWhatsAppApi';
import { waLabeledLink } from '@/lib/whatsappMessageFormat';
import { whatsappGreetingName } from '@/lib/whatsappGreetingName';

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
  const origin = brand === 'elevenro' ? 'https://elevenro.com' : 'https://hydrogenro.com';
  return `${origin}/review/${encodeURIComponent(t)}`;
}

function jobReviewPublicFunctionUrl(name: 'job-review-public' | 'job-review-notify'): string {
  const host = typeof window !== 'undefined' ? window.location.hostname.toLowerCase() : '';
  if (host.includes('elevenro')) {
    return `https://hydrogenro.com/.netlify/functions/${name}`;
  }
  return `/.netlify/functions/${name}`;
}

async function invokePublicJobReviewFn(
  action: 'get' | 'submit',
  body: Record<string, unknown>
): Promise<{ data: unknown; error: string | null; status?: number }> {
  try {
    const res = await fetch(jobReviewPublicFunctionUrl('job-review-public'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, ...body }),
    });
    const json = await res.json().catch(() => null);
    if (res.status === 429) {
      return { data: null, error: 'Too many requests. Please wait a moment.', status: 429 };
    }
    if (!res.ok) {
      const msg =
        (json && typeof json === 'object' && (json as { error?: string }).error) ||
        `HTTP ${res.status}`;
      return { data: null, error: String(msg), status: res.status };
    }
    return { data: json, error: null, status: res.status };
  } catch (err) {
    return { data: null, error: err instanceof Error ? err.message : 'failed' };
  }
}

/** Live DB still grants these to anon until hardening SQL is applied. */
async function invokePublicJobReviewRpc(
  action: 'get' | 'submit',
  body: Record<string, unknown>
): Promise<{ data: unknown; error: string | null }> {
  if (!isSupabaseConfigured()) return { data: null, error: 'failed' };
  try {
    if (action === 'get') {
      const { data, error } = await supabase.rpc('get_job_review_invite', {
        p_token: body.token,
      });
      if (error) return { data: null, error: error.message };
      return { data, error: null };
    }
    const { data, error } = await supabase.rpc('submit_job_review', {
      p_token: body.token,
      p_rating: body.rating,
      p_comment: body.comment ?? '',
    });
    if (error) return { data: null, error: error.message };
    return { data, error: null };
  } catch (err) {
    return { data: null, error: err instanceof Error ? err.message : 'failed' };
  }
}

/** Token suffix for Meta URL buttons (`https://…/review/{{1}}`). */
export function jobReviewTokenFromUrl(url: string | null | undefined): string {
  const m = String(url || '')
    .trim()
    .match(/\/review\/([^/?#]+)/i);
  return m ? decodeURIComponent(m[1]).trim() : '';
}

export function jobReviewColdUrlButtonParam(token: string, index = 1): { index: number; text: string } | null {
  const t = String(token || '').trim();
  if (t.length < 12 || t.length > 48) return null;
  return { index, text: t };
}

export function resolveAskReviewTemplateName(brand: DocumentBrand): string {
  return brand === 'elevenro' ? 'svc_ask_review_ero_v1' : 'svc_ask_review_hro_v1';
}

export function askReviewTemplateFallbackNames(): string[] {
  return ['svc_ask_review_hro_v1', 'svc_ask_review_ero_v1'];
}

export function buildAskReviewWhatsAppMessage(opts: {
  customerName?: string | null;
  brand: DocumentBrand;
  reviewUrl: string;
  jobRef?: string | null;
}): string {
  const name = whatsappGreetingName(opts.customerName, 'there');
  const brandLabel = getDocumentBrandLabel(opts.brand);
  const jobRef = String(opts.jobRef || '').trim();
  return [
    `Hi ${name}, 👋`,
    `Thank you for your recent water purifier service visit with ${brandLabel}.`,
    ...(jobRef ? [`🧾 Visit: ${jobRef}`] : []),
    '',
    waLabeledLink('⭐', 'Review us', opts.reviewUrl),
    '',
    '💬 Reply on this chat if you need any help.',
  ].join('\n');
}

export type LastCompletedJobForReview = {
  id: string;
  jobNumber: string;
  technicianId: string | null;
  brand: DocumentBrand;
};

export async function sendAskReviewForJob(opts: {
  to: string;
  customerId: string;
  customerName?: string | null;
  jobId: string;
  technicianId?: string | null;
  brand?: DocumentBrand | null;
  jobNumber?: string | null;
  reviewUrl?: string | null;
  forceWaMe?: boolean;
  source?: 'inbox' | 'job_completion';
}): Promise<{
  ok: boolean;
  error?: string;
  via?: 'api' | 'template' | 'wa_me';
  usedTemplate?: boolean;
  jobNumber?: string;
  alreadySubmitted?: boolean;
}> {
  const to = String(opts.to || '').trim();
  const customerId = String(opts.customerId || '').trim();
  const jobId = String(opts.jobId || '').trim();
  if (!to) return { ok: false, error: 'Phone required' };
  if (!customerId) return { ok: false, error: 'Customer required' };
  if (!jobId) return { ok: false, error: 'Completed job required' };

  let url = String(opts.reviewUrl || '').trim();
  let token = jobReviewTokenFromUrl(url);
  let brand = opts.brand || 'hydrogenro';

  if (!url || !token) {
    const invite = await createJobReviewInvite({
      jobId,
      technicianId: opts.technicianId,
    });
    if (invite?.alreadySubmitted) {
      return {
        ok: false,
        alreadySubmitted: true,
        jobNumber: String(opts.jobNumber || ''),
        error: opts.jobNumber
          ? `Already reviewed (${opts.jobNumber})`
          : 'This visit was already reviewed',
      };
    }
    if (!invite?.token || !invite.url) {
      return {
        ok: false,
        error: invite?.skipped
          ? 'Could not attach a technician to this job'
          : 'Could not create review link',
      };
    }
    url = invite.url;
    token = invite.token;
    brand = invite.brand || brand;
  }

  const text = buildAskReviewWhatsAppMessage({
    customerName: opts.customerName,
    brand,
    reviewUrl: url,
    jobRef: opts.jobNumber || null,
  });
  const source = opts.source || 'job_completion';

  const textResult = await sendAdminWhatsAppText({
    to,
    text,
    customerId,
    source,
    forceWaMe: opts.forceWaMe === true,
    fallbackWaMe: false,
  });
  if (textResult.ok) {
    return {
      ok: true,
      via: opts.forceWaMe ? 'wa_me' : 'api',
      usedTemplate: false,
      jobNumber: String(opts.jobNumber || ''),
    };
  }
  if (opts.forceWaMe || textResult.featureDisabled) {
    return { ok: false, error: textResult.error || 'Could not send review request' };
  }
  if (!textResult.needsWindowOrTemplate) {
    return { ok: false, error: textResult.error || 'Could not send review request' };
  }

  const reviewButton = jobReviewColdUrlButtonParam(token, 1);
  if (!reviewButton) return { ok: false, error: 'Review link is invalid' };

  const cold = await sendAdminWhatsAppTemplate({
    to,
    templateName: resolveAskReviewTemplateName(brand),
    languageCode: 'en',
    bodyParams: [whatsappGreetingName(opts.customerName, 'there')],
    buttonUrlParams: [reviewButton],
    customerId,
    source,
  });
  if (cold.ok) {
    return {
      ok: true,
      via: 'template',
      usedTemplate: true,
      jobNumber: String(opts.jobNumber || ''),
    };
  }
  return {
    ok: false,
    error: cold.error || '24h window closed and ask-review template is not approved yet.',
  };
}

export async function fetchLastCompletedJobForCustomer(
  customerId: string
): Promise<LastCompletedJobForReview | null> {
  const id = String(customerId || '').trim();
  if (!id) return null;
  const { data, error } = await supabase
    .from('jobs')
    .select('id, job_number, completed_by, assigned_technician_id, service_brand, completed_at')
    .eq('customer_id', id)
    .eq('status', 'COMPLETED')
    .order('completed_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) {
    if (error) console.warn('[job-review] last completed job failed', error.message);
    return null;
  }
  const row = data as Record<string, unknown>;
  const jobId = String(row.id || '').trim();
  if (!jobId) return null;
  return {
    id: jobId,
    jobNumber: String(row.job_number || '').trim(),
    technicianId: String(row.completed_by || row.assigned_technician_id || '').trim() || null,
    brand: normalizeDocumentBrand(row.service_brand) || 'hydrogenro',
  };
}

export async function sendAskReviewForLastCompletedJob(opts: {
  to: string;
  customerId: string;
  customerName?: string | null;
  brand?: DocumentBrand | null;
}): Promise<{
  ok: boolean;
  error?: string;
  via?: 'api' | 'template' | 'wa_me';
  usedTemplate?: boolean;
  jobNumber?: string;
  alreadySubmitted?: boolean;
}> {
  const customerId = String(opts.customerId || '').trim();
  if (!customerId) return { ok: false, error: 'Link a CRM customer to this chat first' };

  const job = await fetchLastCompletedJobForCustomer(customerId);
  if (!job) return { ok: false, error: 'No completed job for this customer' };
  return sendAskReviewForJob({
    to: opts.to,
    customerId,
    customerName: opts.customerName,
    jobId: job.id,
    technicianId: job.technicianId,
    brand: job.brand || opts.brand,
    jobNumber: job.jobNumber,
    source: 'inbox',
  });
}

function parseInvitePayload(data: unknown): JobReviewInvite | null {
  let raw: unknown = data;
  if (typeof raw === 'string') {
    try {
      raw = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  const row = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : null;
  if (!row || row.ok !== true) return null;
  if (row.already_submitted === true) {
    return {
      ok: true,
      token: '',
      brand: normalizeDocumentBrand(row.brand) || 'hydrogenro',
      url: '',
      alreadySubmitted: true,
    };
  }
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
  const technicianId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    String(opts.technicianId || '').trim()
  )
    ? String(opts.technicianId).trim()
    : null;

  const fromFn = await mintInviteViaFunction(jobId, technicianId);
  if (fromFn?.url || fromFn?.alreadySubmitted) return fromFn;

  const fromRpc = await mintInviteViaBrowserRpc(jobId, technicianId);
  if (fromRpc?.url || fromRpc?.alreadySubmitted) return fromRpc;

  return fromFn || fromRpc;
}

async function mintInviteViaBrowserRpc(
  jobId: string,
  technicianId: string | null
): Promise<JobReviewInvite | null> {
  try {
    const access = await resolveSupabaseAccessTokenForApi();
    if (!access || !isSupabaseConfigured() || !supabaseUrl || !supabaseAnonKey) {
      return null;
    }
    const res = await fetch(`${supabaseUrl.replace(/\/$/, '')}/rest/v1/rpc/create_job_review_invite`, {
      method: 'POST',
      headers: {
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${access}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        p_job_id: jobId,
        p_technician_id: technicianId,
      }),
    });
    const json = await res.json().catch(() => null);
    if (!res.ok) {
      console.warn('[job-review] create rpc http', res.status, json);
      return null;
    }
    return parseInvitePayload(json);
  } catch (err) {
    console.warn('[job-review] create rpc error', err);
    return null;
  }
}

async function mintInviteViaFunction(
  jobId: string,
  technicianId: string | null
): Promise<JobReviewInvite | null> {
  try {
    const access = await resolveSupabaseAccessTokenForApi();
    if (!access) return null;
    const res = await fetch('/.netlify/functions/job-review-invite', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${access}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ jobId, technicianId }),
    });
    const json = await res.json().catch(() => null);
    if (!res.ok) {
      console.warn('[job-review] create function failed', res.status, json);
      return null;
    }
    return parseInvitePayload(json);
  } catch (err) {
    console.warn('[job-review] create function error', err);
    return null;
  }
}

/** Attach a public review URL on a job row (retries). No-op when skip_review. */
export async function ensureJobReviewInviteOnJob(
  job: Record<string, unknown>,
  opts?: { attempts?: number }
): Promise<JobReviewInvite | null> {
  if (jobHasSkipReview(job)) return null;
  const jobId = String(job.id || '').trim();
  if (!jobId) return null;
  const technicianId =
    String(
      job.completed_by || job.completedBy || job.assigned_technician_id || job.assignedTechnicianId || ''
    ).trim() || null;
  const attempts = Math.max(1, Number(opts?.attempts) || 3);
  let last: JobReviewInvite | null = null;
  for (let i = 0; i < attempts; i++) {
    last = await createJobReviewInvite({ jobId, technicianId });
    if (last?.url) {
      job.reviewUrl = last.url;
      job.reviewToken = last.token;
      return last;
    }
    if (i < attempts - 1) {
      await new Promise((r) => setTimeout(r, 350));
    }
  }
  return last;
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
    let { data, error } = await invokePublicJobReviewFn('get', { token: t });
    if (error) {
      const fallback = await invokePublicJobReviewRpc('get', { token: t });
      if (!fallback.error) {
        data = fallback.data;
        error = null;
      } else {
        console.warn('[job-review] get failed', error);
        return { invite: null, error: 'failed' };
      }
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
    const comment = String(opts.comment || '').trim().slice(0, 1000);
    let { data, error } = await invokePublicJobReviewFn('submit', {
      token,
      rating,
      comment,
    });
    if (error) {
      const fallback = await invokePublicJobReviewRpc('submit', { token, rating, comment });
      if (!fallback.error) {
        data = fallback.data;
        error = null;
      } else {
        console.warn('[job-review] submit failed', error);
        return { ok: false, error };
      }
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

/** Admin Settings — delete one review (RLS: is_admin_user). */
export async function deleteJobReview(
  reviewId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const id = String(reviewId || '').trim();
  if (!id) return { ok: false, error: 'Review id required' };

  const { error } = await supabase.from('job_reviews').delete().eq('id', id);
  if (error) {
    console.warn('[job-review] delete failed', error.message);
    return { ok: false, error: error.message || 'Could not delete review' };
  }

  try {
    sessionStorage.removeItem(STATS_CACHE_KEY);
  } catch {
    /* ignore */
  }
  return { ok: true };
}

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
  void fetch(jobReviewPublicFunctionUrl('job-review-notify'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: t }),
    keepalive: true,
  }).catch(() => {
    /* ignore */
  });
}
