import { supabase } from '@/lib/supabase';

export interface AppCrashRow {
  id: string;
  app: 'technician' | 'admin';
  /** 'warning' = handled failure the technician never saw; 'crash' = app died. */
  kind: 'crash' | 'warning';
  technician_id: string | null;
  device_token_suffix: string | null;
  device_model: string | null;
  app_version: string | null;
  android_version: string | null;
  exception: string;
  message: string | null;
  occurrences: number;
  first_seen_at: string;
  last_seen_at: string;
  ownerLabel?: string;
}

// `stack` is deliberately absent — it is the big column and is only fetched
// for the one report an admin actually opens.
const LIST_COLUMNS =
  'id,app,kind,technician_id,device_token_suffix,device_model,app_version,android_version,exception,message,occurrences,first_seen_at,last_seen_at';

const CACHE_KEY = 'hro_app_crashes_cache_v1';

export function readCrashCache(): AppCrashRow[] | null {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AppCrashRow[];
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function writeCrashCache(rows: AppCrashRow[]): void {
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify(rows));
  } catch {
    /* ignore quota errors */
  }
}

/** Short name for the UI: com.hydrogenro.X.FooException → FooException. */
export function shortExceptionName(exception: string): string {
  const parts = exception.split('.');
  return parts[parts.length - 1] || exception;
}

export async function loadAppCrashReports(limit = 25): Promise<AppCrashRow[]> {
  const { data, error } = await supabase
    .from('app_crash_reports')
    .select(LIST_COLUMNS)
    .order('last_seen_at', { ascending: false })
    .limit(limit);
  if (error) throw error;

  const rows = (data || []) as AppCrashRow[];
  const techIds = [...new Set(rows.map((r) => r.technician_id).filter(Boolean))] as string[];
  const nameById = new Map<string, string>();
  if (techIds.length > 0) {
    const { data: techs } = await supabase
      .from('technicians')
      .select('id,full_name')
      .in('id', techIds);
    for (const t of techs || []) nameById.set(t.id, t.full_name || 'Technician');
  }

  return rows.map((row) => ({
    ...row,
    kind: row.kind === 'warning' ? 'warning' : 'crash',
    ownerLabel: row.technician_id
      ? nameById.get(row.technician_id) || 'Technician'
      : row.app === 'admin'
        ? 'Admin phone'
        : 'Unknown device',
  }));
}

export async function loadCrashStack(id: string): Promise<string> {
  const { data, error } = await supabase
    .from('app_crash_reports')
    .select('stack')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data?.stack || '';
}

export async function deleteAppCrashReport(id: string): Promise<void> {
  const { error } = await supabase.from('app_crash_reports').delete().eq('id', id);
  if (error) throw error;
}

export async function deleteAppCrashReports(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const { error } = await supabase.from('app_crash_reports').delete().in('id', ids);
  if (error) throw error;
}
