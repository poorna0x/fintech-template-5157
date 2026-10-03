/**
 * Slim customer list (name, phone, alternate phone) saved in the admin app's
 * SQLite. The incoming-call banner reads it on the phone with no network.
 * No-op in the browser and in admin APKs that do not have the plugin.
 */
import { Capacitor, registerPlugin } from '@capacitor/core';
import { supabase } from '@/lib/supabase';

type DirectoryStatus = {
  count?: number;
  syncedAt?: number;
  syncedDay?: string;
  /** ISO time of the last successful check. */
  cursor?: string;
};

type CallerDirectoryPluginApi = {
  getStatus(): Promise<DirectoryStatus>;
  replaceDirectory(opts: {
    customersJson: string;
    day: string;
    cursor?: string;
  }): Promise<{ count?: number }>;
  upsertDirectory?(opts: { customersJson: string; cursor: string }): Promise<{ count?: number }>;
};

const CallerDirectory = registerPlugin<CallerDirectoryPluginApi>('CallerDirectory');

const PAGE = 1000;
/** Re-read a few minutes so a customer saved during the last check is not skipped. */
const OVERLAP_MS = 5 * 60 * 1000;

type SlimCaller = { id: string; name: string; phone: string; alt: string };

export function isAdminCallerDirectoryAvailable(): boolean {
  try {
    return Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('CallerDirectory');
  } catch {
    return false;
  }
}

/** Last 10 digits. Must match CallerDirectoryDb.phoneKey. */
export function callerPhoneKey(raw: string): string {
  const digits = String(raw || '').replace(/\D/g, '');
  if (digits.length < 10) return '';
  return digits.slice(-10);
}

export function callerDirectoryToday(now = new Date()): string {
  return now.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}

export function callerDirectoryIsStale(syncedDay: string, today: string): boolean {
  return syncedDay !== today;
}

/** Empty local list, or no saved checkpoint, needs one full download. */
export function callerDirectoryNeedsFullSync(count: number, cursor: string): boolean {
  return count <= 0 || !String(cursor || '').trim();
}

/** Start of the change query: last check, pulled back a few minutes. */
export function callerChangesSince(storedCursor: string, overlapMs = OVERLAP_MS): string {
  const t = Date.parse(storedCursor);
  if (!Number.isFinite(t)) return '';
  return new Date(t - overlapMs).toISOString();
}

export async function readAdminCallerDirectoryStatus(): Promise<DirectoryStatus | null> {
  if (!isAdminCallerDirectoryAvailable()) return null;
  try {
    return await CallerDirectory.getStatus();
  } catch {
    return null;
  }
}

function mapCallerRow(
  row: {
    id?: string;
    full_name?: string | null;
    phone?: string | null;
    alternate_phone?: string | null;
  },
  keepWithoutPhone: boolean
): SlimCaller | null {
  const id = String(row.id || '').trim();
  if (!id) return null;
  const phone = callerPhoneKey(String(row.phone || ''));
  const alt = callerPhoneKey(String(row.alternate_phone || ''));
  if (!phone && !alt && !keepWithoutPhone) return null;
  const name = String(row.full_name || '').trim() || 'Customer';
  return { id, name, phone, alt };
}

async function fetchSlimCustomers(): Promise<SlimCaller[]> {
  const rows: SlimCaller[] = [];
  let from = 0;
  for (;;) {
    const { data, error } = await supabase
      .from('customers')
      .select('id, full_name, phone, alternate_phone')
      .range(from, from + PAGE - 1);
    if (error) throw error;
    const page = data || [];
    for (const row of page) {
      const mapped = mapCallerRow(row, false);
      if (mapped) rows.push(mapped);
    }
    if (page.length < PAGE) break;
    from += PAGE;
    if (from > 20000) break;
  }
  return rows;
}

async function fetchChangedCustomers(sinceIso: string): Promise<SlimCaller[]> {
  const rows: SlimCaller[] = [];
  let from = 0;
  for (;;) {
    const { data, error } = await supabase
      .from('customers')
      .select('id, full_name, phone, alternate_phone, updated_at')
      .gte('updated_at', sinceIso)
      .order('updated_at', { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw error;
    const page = data || [];
    for (const row of page) {
      const mapped = mapCallerRow(row, true);
      if (mapped) rows.push(mapped);
    }
    if (page.length < PAGE) break;
    from += PAGE;
    if (from > 20000) break;
  }
  return rows;
}

/** Full replace. Used the first time, after a clear, and from Download again. */
export async function downloadAdminCallerDirectory(): Promise<{ count: number }> {
  if (!isAdminCallerDirectoryAvailable()) {
    throw new Error('Open this on the admin app');
  }
  const started = new Date().toISOString();
  const rows = await fetchSlimCustomers();
  const day = callerDirectoryToday();
  const result = await CallerDirectory.replaceDirectory({
    customersJson: JSON.stringify(rows),
    day,
    cursor: started,
  });
  return { count: Number(result?.count ?? rows.length) || 0 };
}

async function upsertChangedCustomers(sinceIso: string, cursor: string): Promise<void> {
  if (typeof CallerDirectory.upsertDirectory !== 'function') {
    await downloadAdminCallerDirectory();
    return;
  }
  const rows = await fetchChangedCustomers(sinceIso);
  try {
    await CallerDirectory.upsertDirectory({
      customersJson: JSON.stringify(rows),
      cursor,
    });
  } catch {
    await downloadAdminCallerDirectory();
  }
}

/**
 * Each app open: if the phone has no list yet, download everyone.
 * After that, only customers added or edited since the last check.
 */
export async function syncAdminCallerDirectoryIfStale(): Promise<void> {
  if (!isAdminCallerDirectoryAvailable()) return;
  try {
    const status = await CallerDirectory.getStatus();
    const count = Number(status?.count || 0);
    const cursor = String(status?.cursor || '');
    if (callerDirectoryNeedsFullSync(count, cursor)) {
      await downloadAdminCallerDirectory();
      return;
    }
    const since = callerChangesSince(cursor);
    if (!since) {
      await downloadAdminCallerDirectory();
      return;
    }
    await upsertChangedCustomers(since, new Date().toISOString());
  } catch {
    /* keep the list already on the phone; Download again can retry */
  }
}
