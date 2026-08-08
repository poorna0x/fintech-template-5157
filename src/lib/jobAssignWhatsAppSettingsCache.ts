/**
 * Job assign/unassign WhatsApp prefs (DB) + localStorage cache.
 * - Dashboard master `enabled`: OFF = no popup / no auto-send at all
 * - WhatsApp Settings `autoAssign` / `autoUnassign`: when master ON, send instantly via API
 * Manual dialog path is always wa.me (not Cloud API).
 */
import { supabase } from '@/lib/supabaseClient';

export const JOB_WA_NOTIFY_CACHE_KEY = 'wa_job_notify_prefs_v2';
export const JOB_WA_NOTIFY_CHANGED_EVENT = 'jobWaNotifyPrefsChanged';

const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

export type JobWhatsAppNotifyPrefs = {
  /** Master: assign/unassign WhatsApp UI + auto-send. Dashboard Settings. */
  enabled: boolean;
  /** WhatsApp Settings: instant API send on assign (no dialog). */
  autoAssign: boolean;
  /** WhatsApp Settings: instant API send on unassign (no dialog). */
  autoUnassign: boolean;
};

type CacheBlob = JobWhatsAppNotifyPrefs & { savedAt: number };

const DEFAULTS: JobWhatsAppNotifyPrefs = {
  enabled: true,
  autoAssign: false,
  autoUnassign: false,
};

let memory: CacheBlob | null = null;

function normalizePrefs(raw: Partial<JobWhatsAppNotifyPrefs> | null | undefined): JobWhatsAppNotifyPrefs {
  return {
    enabled: raw?.enabled !== false,
    autoAssign: raw?.autoAssign === true,
    autoUnassign: raw?.autoUnassign === true,
  };
}

export function readJobWhatsAppNotifyPrefsCached(): JobWhatsAppNotifyPrefs | null {
  if (memory && Date.now() - memory.savedAt < CACHE_TTL_MS) {
    return normalizePrefs(memory);
  }
  try {
    const raw = localStorage.getItem(JOB_WA_NOTIFY_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CacheBlob;
    if (!parsed || typeof parsed.savedAt !== 'number') return null;
    if (Date.now() - parsed.savedAt >= CACHE_TTL_MS) return null;
    memory = parsed;
    return normalizePrefs(parsed);
  } catch {
    return null;
  }
}

export function writeJobWhatsAppNotifyPrefsCache(prefs: JobWhatsAppNotifyPrefs): void {
  const blob: CacheBlob = { ...normalizePrefs(prefs), savedAt: Date.now() };
  memory = blob;
  try {
    localStorage.setItem(JOB_WA_NOTIFY_CACHE_KEY, JSON.stringify(blob));
  } catch {
    /* ignore quota */
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(JOB_WA_NOTIFY_CHANGED_EVENT, { detail: blob }));
  }
}

/** Thin select — master allow + auto-send flags only. */
export async function fetchJobWhatsAppNotifyPrefs(): Promise<{
  ok: boolean;
  prefs: JobWhatsAppNotifyPrefs;
  error?: string;
}> {
  const { data, error } = await supabase
    .from('whatsapp_crm_settings')
    .select(
      'allow_job_assign_whatsapp, allow_job_unassign_whatsapp, auto_send_job_assign_whatsapp, auto_send_job_unassign_whatsapp'
    )
    .eq('id', 1)
    .maybeSingle();

  if (error) {
    const cached = readJobWhatsAppNotifyPrefsCached();
    return {
      ok: false,
      prefs: cached || { ...DEFAULTS },
      error: error.message,
    };
  }

  // Master: both allow columns stay in sync from Dashboard; treat assign flag as source of truth.
  const prefs = normalizePrefs({
    enabled: data?.allow_job_assign_whatsapp !== false,
    autoAssign: data?.auto_send_job_assign_whatsapp === true,
    autoUnassign: data?.auto_send_job_unassign_whatsapp === true,
  });
  writeJobWhatsAppNotifyPrefsCache(prefs);
  return { ok: true, prefs };
}

export async function ensureJobWhatsAppNotifyPrefs(): Promise<JobWhatsAppNotifyPrefs> {
  const cached = readJobWhatsAppNotifyPrefsCached();
  if (cached) return cached;
  const { prefs } = await fetchJobWhatsAppNotifyPrefs();
  return prefs;
}

/** Dashboard master toggle — sets both allow columns together. */
export async function saveJobWhatsAppMasterEnabled(
  enabled: boolean
): Promise<{ ok: boolean; prefs?: JobWhatsAppNotifyPrefs; error?: string }> {
  const current = readJobWhatsAppNotifyPrefsCached() || { ...DEFAULTS };
  const next = normalizePrefs({ ...current, enabled });

  const { error } = await supabase
    .from('whatsapp_crm_settings')
    .update({
      allow_job_assign_whatsapp: next.enabled,
      allow_job_unassign_whatsapp: next.enabled,
      updated_at: new Date().toISOString(),
    })
    .eq('id', 1);

  if (error) return { ok: false, error: error.message };
  writeJobWhatsAppNotifyPrefsCache(next);
  return { ok: true, prefs: next };
}

export function syncJobWhatsAppNotifyCacheFromCrmSettings(row: {
  allow_job_assign_whatsapp?: boolean;
  allow_job_unassign_whatsapp?: boolean;
  auto_send_job_assign_whatsapp?: boolean;
  auto_send_job_unassign_whatsapp?: boolean;
}): void {
  writeJobWhatsAppNotifyPrefsCache({
    enabled: row.allow_job_assign_whatsapp !== false,
    autoAssign: row.auto_send_job_assign_whatsapp === true,
    autoUnassign: row.auto_send_job_unassign_whatsapp === true,
  });
}
