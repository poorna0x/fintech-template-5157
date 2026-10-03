/**
 * Technician app copy of the caller list. The phone stores names and numbers
 * locally. Opening the app asks the server only for customers changed since
 * the last check. The browser has no plugin, so this does nothing there.
 */
import { Capacitor, registerPlugin } from '@capacitor/core';
import { supabase } from '@/lib/supabase';
import {
  callerDirectoryNeedsFullSync,
  callerChangesSince,
  callerDirectoryToday,
} from '@/lib/adminCallerDirectory';

type DirectoryStatus = {
  count?: number;
  syncedAt?: number;
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

let techSyncInFlight = false;
let techSyncDone = false;

type SlimCaller = { id: string; name: string; phone: string; alt: string };

export function isTechCallerDirectoryAvailable(): boolean {
  try {
    return Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('CallerDirectory');
  } catch {
    return false;
  }
}

function mapRows(
  rows: Array<{ id?: string; full_name?: string; phone?: string; alternate_phone?: string }>
): SlimCaller[] {
  return rows
    .map((row) => ({
      id: String(row.id || '').trim(),
      name: String(row.full_name || '').trim() || 'Customer',
      phone: String(row.phone || '').trim(),
      alt: String(row.alternate_phone || '').trim(),
    }))
    .filter((row) => row.id);
}

async function fetchDirectory(since: string): Promise<{ customers: SlimCaller[]; cursor: string }> {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token || '';
  if (!token) throw new Error('Not signed in');
  const res = await fetch('/.netlify/functions/caller-directory', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(since ? { since } : {}),
  });
  const body = (await res.json().catch(() => ({}))) as {
    customers?: Array<{ id?: string; full_name?: string; phone?: string; alternate_phone?: string }>;
    cursor?: string;
    error?: string;
  };
  if (!res.ok) throw new Error(body.error || 'Download failed');
  return {
    customers: mapRows(body.customers || []),
    cursor: String(body.cursor || new Date().toISOString()),
  };
}

export async function downloadTechCallerDirectory(): Promise<number> {
  if (!isTechCallerDirectoryAvailable()) return 0;
  const { customers, cursor } = await fetchDirectory('');
  const saved = await CallerDirectory.replaceDirectory({
    customersJson: JSON.stringify(customers),
    day: callerDirectoryToday(),
    cursor,
  });
  return Number(saved?.count ?? customers.length);
}

async function upsertChanged(since: string): Promise<void> {
  if (typeof CallerDirectory.upsertDirectory !== 'function') {
    await downloadTechCallerDirectory();
    return;
  }
  const { customers, cursor } = await fetchDirectory(since);
  await CallerDirectory.upsertDirectory({
    customersJson: JSON.stringify(customers),
    cursor,
  });
}

/** Full list the first time. Later opens update only new or edited customers. */
export async function syncTechCallerDirectoryIfStale(): Promise<void> {
  if (!isTechCallerDirectoryAvailable()) return;
  if (techSyncInFlight || techSyncDone) return;
  techSyncInFlight = true;
  try {
    const status = await CallerDirectory.getStatus();
    const count = Number(status?.count ?? 0);
    const cursor = String(status?.cursor || '');
    if (callerDirectoryNeedsFullSync(count, cursor)) {
      await downloadTechCallerDirectory();
    } else {
      const since = callerChangesSince(cursor);
      if (!since) await downloadTechCallerDirectory();
      else await upsertChanged(since);
    }
    techSyncDone = true;
  } catch {
    /* keep the list already on the phone; the next open retries this check */
  } finally {
    techSyncInFlight = false;
  }
}
