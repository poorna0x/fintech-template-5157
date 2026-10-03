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
};

type CallerDirectoryPluginApi = {
  getStatus(): Promise<DirectoryStatus>;
  replaceDirectory(opts: { customersJson: string; day: string }): Promise<{ count?: number }>;
};

const CallerDirectory = registerPlugin<CallerDirectoryPluginApi>('CallerDirectory');

const PAGE = 1000;

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

export async function readAdminCallerDirectoryStatus(): Promise<DirectoryStatus | null> {
  if (!isAdminCallerDirectoryAvailable()) return null;
  try {
    return await CallerDirectory.getStatus();
  } catch {
    return null;
  }
}

async function fetchSlimCustomers(): Promise<
  { id: string; name: string; phone: string; alt: string }[]
> {
  const rows: { id: string; name: string; phone: string; alt: string }[] = [];
  let from = 0;
  for (;;) {
    const { data, error } = await supabase
      .from('customers')
      .select('id, full_name, phone, alternate_phone')
      .range(from, from + PAGE - 1);
    if (error) throw error;
    const page = data || [];
    for (const row of page) {
      const id = String(row.id || '').trim();
      if (!id) continue;
      const phone = callerPhoneKey(String(row.phone || ''));
      const alt = callerPhoneKey(String(row.alternate_phone || ''));
      if (!phone && !alt) continue;
      const name = String(row.full_name || '').trim() || 'Customer';
      rows.push({ id, name, phone, alt });
    }
    if (page.length < PAGE) break;
    from += PAGE;
    if (from > 20000) break;
  }
  return rows;
}

/** Download the list onto this phone. Leaves the old list in place if the download fails. */
export async function downloadAdminCallerDirectory(): Promise<{ count: number }> {
  if (!isAdminCallerDirectoryAvailable()) {
    throw new Error('Open this on the admin app');
  }
  const rows = await fetchSlimCustomers();
  const day = callerDirectoryToday();
  const result = await CallerDirectory.replaceDirectory({
    customersJson: JSON.stringify(rows),
    day,
  });
  return { count: Number(result?.count ?? rows.length) || 0 };
}

/** Once per IST day when the admin app is opened. */
export async function syncAdminCallerDirectoryIfStale(): Promise<void> {
  if (!isAdminCallerDirectoryAvailable()) return;
  try {
    const status = await CallerDirectory.getStatus();
    const today = callerDirectoryToday();
    if (!callerDirectoryIsStale(String(status?.syncedDay || ''), today)) return;
    await downloadAdminCallerDirectory();
  } catch {
    /* keep yesterday's list; the settings button can retry */
  }
}
