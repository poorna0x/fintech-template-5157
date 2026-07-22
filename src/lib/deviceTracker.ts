import { supabase } from '@/lib/supabase';
import {
  type AdminPushPrefs,
  type TechPushPrefs,
  normalizeAdminPushPrefs,
  normalizeTechPushPrefs,
} from '@/lib/pushNotificationPrefs';

export interface DeviceRow {
  token: string;
  display_name: string | null;
  device_model: string | null;
  push_enabled: boolean;
  call_alerts_enabled: boolean;
  push_prefs: AdminPushPrefs | TechPushPrefs;
  updated_at: string;
}

export interface AdminDeviceRow extends DeviceRow {
  user_id: string;
  push_prefs: AdminPushPrefs;
  ownerLabel?: string;
}

export interface TechnicianDeviceRow extends DeviceRow {
  technician_id: string;
  push_prefs: TechPushPrefs;
  ownerLabel?: string;
}

export type AdminDevicePatch = Partial<
  Pick<AdminDeviceRow, 'display_name' | 'push_enabled' | 'call_alerts_enabled' | 'push_prefs'>
>;

export type TechnicianDevicePatch = Partial<
  Pick<TechnicianDeviceRow, 'display_name' | 'push_enabled' | 'call_alerts_enabled' | 'push_prefs'>
>;

const DEVICE_COLUMNS =
  'token,display_name,device_model,push_enabled,call_alerts_enabled,push_prefs,updated_at';

const DEVICE_TRACKER_CACHE_KEY = 'hro_device_tracker_cache_v1';

export interface DeviceTrackerCache {
  adminDevices: AdminDeviceRow[];
  techDevices: TechnicianDeviceRow[];
  savedAt: number;
}

export function readDeviceTrackerCache(): DeviceTrackerCache | null {
  try {
    const raw = sessionStorage.getItem(DEVICE_TRACKER_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DeviceTrackerCache;
    if (!Array.isArray(parsed.adminDevices) || !Array.isArray(parsed.techDevices)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeDeviceTrackerCache(
  adminDevices: AdminDeviceRow[],
  techDevices: TechnicianDeviceRow[]
): void {
  try {
    sessionStorage.setItem(
      DEVICE_TRACKER_CACHE_KEY,
      JSON.stringify({ adminDevices, techDevices, savedAt: Date.now() } satisfies DeviceTrackerCache)
    );
  } catch {
    /* ignore quota errors */
  }
}

export function clearDeviceTrackerCache(): void {
  try {
    sessionStorage.removeItem(DEVICE_TRACKER_CACHE_KEY);
  } catch {
    /* ignore */
  }
}

export function tokenSuffix(token: string): string {
  const t = token.trim();
  return t.length > 8 ? `…${t.slice(-8)}` : t;
}

export function formatDeviceLastSeen(updatedAt: string): string {
  const d = new Date(updatedAt);
  if (Number.isNaN(d.getTime())) return 'Unknown';
  const diffMs = Date.now() - d.getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 2) return 'Just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 48) return `${hours}h ago`;
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function resolveDisplayName(
  row: { display_name?: string | null; device_model?: string | null; token?: string },
  fallback: string
): string {
  return row.display_name?.trim() || row.device_model?.trim() || fallback;
}

/** Name used when the phone model could not be detected (web or old APK). */
export function fallbackAdminDeviceName(index: number, token?: string): string {
  const base = index === 0 ? 'Admin phone' : `Admin phone ${index + 1}`;
  if (!token) return base;
  return `${base} · ${tokenSuffix(token).replace(/^…/, '')}`;
}

export function fallbackTechDeviceName(ownerName: string, index: number, token?: string): string {
  const owner = ownerName.trim() || 'Technician';
  const base = index === 0 ? `${owner}'s phone` : `${owner}'s phone ${index + 1}`;
  if (!token) return base;
  return `${base} · ${tokenSuffix(token).replace(/^…/, '')}`;
}

/** Default display name on first token registration (native or web). */
export function registrationDeviceName(
  kind: 'admin' | 'technician',
  token: string,
  detectedModel?: string | null,
  ownerName?: string
): string {
  const model = detectedModel?.trim();
  if (model) return model;
  if (kind === 'admin') return fallbackAdminDeviceName(0, token);
  return fallbackTechDeviceName(ownerName || 'Technician', 0, token);
}

export async function loadAdminDevices(): Promise<AdminDeviceRow[]> {
  const { data, error } = await supabase
    .from('admin_push_tokens')
    .select(`${DEVICE_COLUMNS},user_id`)
    .order('updated_at', { ascending: false });
  if (error) throw error;

  const rows = (data || []) as AdminDeviceRow[];
  const { data: admins } = await supabase.from('admin_users').select('email,full_name').eq('is_active', true);
  const adminNames = (admins || []).map((a) => a.full_name || a.email).filter(Boolean);

  return rows.map((row, i) => ({
    ...row,
    push_enabled: row.push_enabled !== false,
    call_alerts_enabled: row.call_alerts_enabled !== false,
    push_prefs: normalizeAdminPushPrefs(row.push_prefs),
    ownerLabel: adminNames.length === 1 ? adminNames[0] : 'Admin',
    display_name: resolveDisplayName(row, fallbackAdminDeviceName(i, row.token)),
  }));
}

export async function loadTechnicianDevices(): Promise<TechnicianDeviceRow[]> {
  const { data, error } = await supabase
    .from('technician_push_tokens')
    .select(`${DEVICE_COLUMNS},technician_id`)
    .order('updated_at', { ascending: false });
  if (error) throw error;

  const rows = (data || []) as TechnicianDeviceRow[];
  const techIds = [...new Set(rows.map((r) => r.technician_id))];
  const nameById = new Map<string, string>();
  if (techIds.length > 0) {
    const { data: techs } = await supabase.from('technicians').select('id,full_name').in('id', techIds);
    for (const t of techs || []) nameById.set(t.id, t.full_name || 'Technician');
  }

  const indexByTech = new Map<string, number>();
  return rows.map((row) => {
    const idx = indexByTech.get(row.technician_id) ?? 0;
    indexByTech.set(row.technician_id, idx + 1);
    const ownerName = nameById.get(row.technician_id) || 'Technician';
    const fallback = fallbackTechDeviceName(ownerName, idx, row.token);
    return {
      ...row,
      push_enabled: row.push_enabled !== false,
      call_alerts_enabled: row.call_alerts_enabled !== false,
      push_prefs: normalizeTechPushPrefs(row.push_prefs),
      ownerLabel: ownerName,
      display_name: resolveDisplayName(row, fallback),
    };
  });
}

export async function updateAdminDevice(token: string, patch: AdminDevicePatch): Promise<void> {
  const { error } = await supabase.from('admin_push_tokens').update(patch).eq('token', token);
  if (error) throw error;
}

export async function updateTechnicianDevice(
  token: string,
  patch: TechnicianDevicePatch
): Promise<void> {
  const { error } = await supabase.from('technician_push_tokens').update(patch).eq('token', token);
  if (error) throw error;
}

export async function deleteAdminDevice(token: string): Promise<void> {
  const { error } = await supabase.from('admin_push_tokens').delete().eq('token', token);
  if (error) throw error;
}

export async function deleteTechnicianDevice(token: string): Promise<void> {
  const { error } = await supabase.from('technician_push_tokens').delete().eq('token', token);
  if (error) throw error;
}

export async function loadDevicePrefsForToken(
  table: 'admin_push_tokens' | 'technician_push_tokens',
  token: string
): Promise<{ call_alerts_enabled: boolean } | null> {
  const { data, error } = await supabase
    .from(table)
    .select('call_alerts_enabled')
    .eq('token', token)
    .maybeSingle();
  if (error || !data) return null;
  return { call_alerts_enabled: data.call_alerts_enabled !== false };
}
