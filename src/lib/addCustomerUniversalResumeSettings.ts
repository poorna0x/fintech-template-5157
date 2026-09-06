import { supabase } from '@/lib/supabase';

export const ADD_CUSTOMER_UNIVERSAL_RESUME_KEY = 'add_customer_universal_resume';
export const ADD_CUSTOMER_UNIVERSAL_RESUME_CHANGED_EVENT = 'addCustomerUniversalResumeChanged';
const CACHE_KEY = 'hro_add_customer_universal_resume';

function cacheEnabled(enabled: boolean) {
  try {
    localStorage.setItem(CACHE_KEY, enabled ? 'true' : 'false');
  } catch {
    /* ignore */
  }
}

function notifyEnabled(enabled: boolean) {
  cacheEnabled(enabled);
  window.dispatchEvent(
    new CustomEvent(ADD_CUSTOMER_UNIVERSAL_RESUME_CHANGED_EVENT, { detail: { enabled } })
  );
}

/** Missing cache / row defaults to on (draft follows this login to other phones). */
export function readAddCustomerUniversalResumeCached(): boolean {
  try {
    const stored = localStorage.getItem(CACHE_KEY);
    if (stored === 'false') return false;
    if (stored === 'true') return true;
  } catch {
    /* ignore */
  }
  return true;
}

export async function fetchAddCustomerUniversalResumeEnabled(): Promise<{
  enabled: boolean;
  error: string | null;
}> {
  const { data, error } = await supabase
    .from('crm_settings')
    .select('value')
    .eq('key', ADD_CUSTOMER_UNIVERSAL_RESUME_KEY)
    .maybeSingle();

  if (error) return { enabled: readAddCustomerUniversalResumeCached(), error: error.message };
  const enabled = data?.value !== false;
  cacheEnabled(enabled);
  return { enabled, error: null };
}

export async function saveAddCustomerUniversalResumeEnabled(
  enabled: boolean
): Promise<{ ok: boolean; error: string | null }> {
  const previous = readAddCustomerUniversalResumeCached();
  notifyEnabled(enabled);
  const { error } = await supabase.from('crm_settings').upsert(
    {
      key: ADD_CUSTOMER_UNIVERSAL_RESUME_KEY,
      value: enabled,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'key' }
  );

  if (error) {
    notifyEnabled(previous);
    return { ok: false, error: error.message };
  }
  return { ok: true, error: null };
}
