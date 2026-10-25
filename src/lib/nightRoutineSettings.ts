import { supabase } from '@/lib/supabase';

export const NIGHT_ROUTINE_KEY = 'night_routine';

export type NightRoutineSettings = {
  /** Evening summary, cash questions, parts check, technician-expense check. */
  admin: boolean;
  /** Worked hours, parts reminder, and cash handover sent to technicians. */
  technician: boolean;
  /** Business expense check. */
  business: boolean;
};

export const DEFAULT_NIGHT_ROUTINE: NightRoutineSettings = {
  admin: true,
  technician: true,
  business: true,
};

export function normalizeNightRoutine(value: unknown): NightRoutineSettings {
  if (!value || typeof value !== 'object') return { ...DEFAULT_NIGHT_ROUTINE };
  const row = value as Record<string, unknown>;
  return {
    admin: row.admin !== false,
    technician: row.technician !== false,
    business: row.business !== false,
  };
}

/** Per-technician gate stored on technicians.push_prefs.night_routine. Missing = on. */
export function readTechNightRoutine(prefs: unknown): boolean {
  if (!prefs || typeof prefs !== 'object') return true;
  return (prefs as Record<string, unknown>).night_routine !== false;
}

export async function fetchNightRoutine(): Promise<{
  settings: NightRoutineSettings;
  error: string | null;
}> {
  const { data, error } = await supabase
    .from('crm_settings')
    .select('value')
    .eq('key', NIGHT_ROUTINE_KEY)
    .maybeSingle();
  if (error) return { settings: { ...DEFAULT_NIGHT_ROUTINE }, error: error.message };
  return { settings: normalizeNightRoutine(data?.value), error: null };
}

export async function saveNightRoutine(
  settings: NightRoutineSettings
): Promise<{ ok: boolean; error: string | null }> {
  const { error } = await supabase.from('crm_settings').upsert(
    {
      key: NIGHT_ROUTINE_KEY,
      value: normalizeNightRoutine(settings),
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'key' }
  );
  return { ok: !error, error: error?.message || null };
}
