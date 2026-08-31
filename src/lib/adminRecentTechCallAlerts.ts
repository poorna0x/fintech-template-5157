/**
 * Admin device: remember tech-call push alerts (customer rang a technician).
 * Prefers native SharedPreferences (saved when FCM arrives even if APK is killed),
 * merged into localStorage for the web UI. Retention: 24 hours.
 */
import { Capacitor, registerPlugin } from '@capacitor/core';
import { normalizePhoneForSearch } from '@/lib/utils';

const STORAGE_KEY = 'hro_admin_recent_tech_calls_v1';
const MAX_ITEMS = 50;
const TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

type DevicePrefsPlugin = {
  listRecentTechCallAlerts?: () => Promise<{ itemsJson?: string }>;
  clearRecentTechCallAlerts?: () => Promise<void>;
};

const DevicePrefs = registerPlugin<DevicePrefsPlugin>('DevicePrefs');

export type AdminRecentTechCallKind = 'tech_call' | 'missed_call' | 'wrong_line_call';

export type AdminRecentTechCall = {
  phone: string;
  at: number;
  kind: AdminRecentTechCallKind;
  techName?: string;
  customerId?: string;
  callId?: string;
  fromNumber?: string;
  companyPhone?: string;
};

function isKind(v: unknown): v is AdminRecentTechCallKind {
  return v === 'tech_call' || v === 'missed_call' || v === 'wrong_line_call';
}

function normalizeRow(row: Partial<AdminRecentTechCall>): AdminRecentTechCall | null {
  const phone = normalizePhoneForSearch(String(row.phone || ''));
  if (phone.length < 10 || typeof row.at !== 'number') return null;
  if (!isKind(row.kind)) return null;
  if (Date.now() - row.at >= TTL_MS) return null;
  return {
    phone,
    at: row.at,
    kind: row.kind,
    ...(row.techName ? { techName: String(row.techName) } : {}),
    ...(row.customerId ? { customerId: String(row.customerId) } : {}),
    ...(row.callId ? { callId: String(row.callId) } : {}),
    ...(row.fromNumber ? { fromNumber: String(row.fromNumber) } : {}),
    ...(row.companyPhone ? { companyPhone: String(row.companyPhone) } : {}),
  };
}

function readLocal(): AdminRecentTechCall[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((row) => normalizeRow(row as Partial<AdminRecentTechCall>))
      .filter((r): r is AdminRecentTechCall => !!r)
      .slice(0, MAX_ITEMS);
  } catch {
    return [];
  }
}

function writeLocal(items: AdminRecentTechCall[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items.slice(0, MAX_ITEMS)));
  } catch {
    /* quota */
  }
}

function mergeLists(
  a: AdminRecentTechCall[],
  b: AdminRecentTechCall[]
): AdminRecentTechCall[] {
  // One row per phone — keep the newest alert (10 calls → 1 recent entry).
  const map = new Map<string, AdminRecentTechCall>();
  for (const row of [...a, ...b]) {
    const k = row.phone;
    const prev = map.get(k);
    if (!prev || row.at > prev.at) map.set(k, row);
  }
  return [...map.values()].sort((x, y) => y.at - x.at).slice(0, MAX_ITEMS);
}

async function readNative(): Promise<AdminRecentTechCall[]> {
  if (!Capacitor.isNativePlatform()) return [];
  try {
    if (typeof DevicePrefs.listRecentTechCallAlerts !== 'function') return [];
    const res = await DevicePrefs.listRecentTechCallAlerts();
    const parsed = JSON.parse(String(res?.itemsJson || '[]')) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((row) => normalizeRow(row as Partial<AdminRecentTechCall>))
      .filter((r): r is AdminRecentTechCall => !!r);
  } catch {
    return [];
  }
}

/** Merge native + localStorage (newest first, 24h). */
export async function listAdminRecentTechCalls(): Promise<AdminRecentTechCall[]> {
  const merged = mergeLists(readLocal(), await readNative());
  writeLocal(merged);
  return merged;
}

/** Sync list for UI that prefers sync read after await listAdminRecentTechCalls. */
export function listAdminRecentTechCallsSync(): AdminRecentTechCall[] {
  return readLocal().sort((a, b) => b.at - a.at);
}

/**
 * Persist from JS push path (foreground receive / notification tap).
 * Native APK also saves on FCM receive even if the tray is never opened.
 */
export function rememberAdminTechCallFromPush(
  raw: Record<string, unknown> | null | undefined
): AdminRecentTechCall | null {
  if (!raw || typeof raw !== 'object') return null;
  const type = String(raw.type || '').trim();
  if (type !== 'tech_call' && type !== 'wrong_line_call') return null;

  const phone = normalizePhoneForSearch(String(raw.phone || raw.query || ''));
  if (phone.length < 10) return null;

  const missed =
    String(raw.missed || '').toLowerCase() === 'true' || String(raw.missed || '') === '1';
  let kind: AdminRecentTechCallKind = 'tech_call';
  if (type === 'wrong_line_call') kind = 'wrong_line_call';
  else if (missed) kind = 'missed_call';

  const callId = String(raw.callId || '').trim() || undefined;
  const techName = String(raw.techName || '').trim() || undefined;
  const customerId = String(raw.customerId || '').trim() || undefined;
  const fromNumber = String(raw.fromNumber || '').trim() || undefined;
  const companyPhone = String(raw.companyPhone || '').trim() || undefined;
  const at = Date.now();

  const next: AdminRecentTechCall = {
    phone,
    at,
    kind,
    ...(techName ? { techName } : {}),
    ...(customerId ? { customerId } : {}),
    ...(callId ? { callId } : {}),
    ...(fromNumber ? { fromNumber } : {}),
    ...(companyPhone ? { companyPhone } : {}),
  };

  writeLocal(mergeLists([next], readLocal()));
  return next;
}

export async function clearAdminRecentTechCalls(): Promise<void> {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
  if (Capacitor.isNativePlatform() && typeof DevicePrefs.clearRecentTechCallAlerts === 'function') {
    try {
      await DevicePrefs.clearRecentTechCallAlerts();
    } catch {
      /* ignore */
    }
  }
}
