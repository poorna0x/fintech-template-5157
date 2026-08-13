/**
 * Global technician push notification settings (singleton push_crm_settings).
 */
import { supabase } from '@/lib/supabaseClient';
import {
  defaultTechPushPrefs,
  normalizeTechPushPrefs,
  TECH_PUSH_CATEGORIES,
  type TechPushPrefs,
} from '@/lib/pushNotificationPrefs';

export type PushCrmSettings = {
  id: number;
  enabled: boolean;
  tech_prefs: TechPushPrefs;
  notes: string | null;
  updated_at: string | null;
};

export const DEFAULT_PUSH_CRM_SETTINGS: PushCrmSettings = {
  id: 1,
  enabled: true,
  tech_prefs: defaultTechPushPrefs(),
  notes: null,
  updated_at: null,
};

export function normalizePushCrmSettings(
  row: Partial<{ enabled: boolean; tech_prefs: unknown; notes: string | null; updated_at: string | null }> | null
): PushCrmSettings {
  if (!row) return { ...DEFAULT_PUSH_CRM_SETTINGS, tech_prefs: defaultTechPushPrefs() };
  return {
    id: 1,
    enabled: row.enabled !== false,
    tech_prefs: normalizeTechPushPrefs(row.tech_prefs),
    notes: row.notes ?? null,
    updated_at: row.updated_at ?? null,
  };
}

export async function fetchPushCrmSettings(): Promise<{
  ok: boolean;
  settings: PushCrmSettings;
  error?: string;
}> {
  const { data, error } = await supabase
    .from('push_crm_settings')
    .select('id, enabled, tech_prefs, notes, updated_at')
    .eq('id', 1)
    .maybeSingle();
  if (error) {
    return {
      ok: false,
      settings: { ...DEFAULT_PUSH_CRM_SETTINGS, tech_prefs: defaultTechPushPrefs() },
      error: error.message,
    };
  }
  return { ok: true, settings: normalizePushCrmSettings(data) };
}

export async function savePushCrmSettings(
  patch: Partial<PushCrmSettings>
): Promise<{ ok: boolean; settings?: PushCrmSettings; error?: string }> {
  const prefs = normalizeTechPushPrefs(patch.tech_prefs);
  // Store only explicit falses + trues for clarity (full map)
  const tech_prefs: Record<string, boolean> = {};
  for (const key of TECH_PUSH_CATEGORIES) {
    tech_prefs[key] = prefs[key] !== false;
  }

  const payload = {
    enabled: patch.enabled !== false,
    tech_prefs,
    notes: patch.notes?.trim() ? patch.notes.trim() : null,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from('push_crm_settings')
    .update(payload)
    .eq('id', 1)
    .select('id, enabled, tech_prefs, notes, updated_at')
    .single();

  if (error) return { ok: false, error: error.message };
  return { ok: true, settings: normalizePushCrmSettings(data) };
}
