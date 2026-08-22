/**
 * Admin device: remember tech-call push alerts (customer rang a technician).
 * localStorage only — so Tools → Recent Accounts can reopen those callers
 * after the toast/banner is gone. No Supabase egress.
 */
import { normalizePhoneForSearch } from '@/lib/utils';

const STORAGE_KEY = 'hro_admin_recent_tech_calls_v1';
const MAX_ITEMS = 40;
const TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

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

function readRaw(): AdminRecentTechCall[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const now = Date.now();
    return parsed
      .filter((row): row is AdminRecentTechCall => {
        if (!row || typeof row !== 'object') return false;
        const r = row as AdminRecentTechCall;
        return (
          typeof r.phone === 'string' &&
          typeof r.at === 'number' &&
          now - r.at < TTL_MS &&
          (r.kind === 'tech_call' ||
            r.kind === 'missed_call' ||
            r.kind === 'wrong_line_call')
        );
      })
      .slice(0, MAX_ITEMS);
  } catch {
    return [];
  }
}

function writeRaw(items: AdminRecentTechCall[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items.slice(0, MAX_ITEMS)));
  } catch {
    /* quota / private mode */
  }
}

export function listAdminRecentTechCalls(): AdminRecentTechCall[] {
  return readRaw().sort((a, b) => b.at - a.at);
}

/**
 * Persist a tech-call style FCM payload (foreground receive or notification tap).
 * Dedupes by callId when present, else phone + kind within 2 minutes.
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

  const prev = readRaw();
  const filtered = prev.filter((row) => {
    if (callId && row.callId && row.callId === callId) return false;
    if (
      !callId &&
      row.phone === phone &&
      row.kind === kind &&
      Math.abs(row.at - at) < 2 * 60_000
    ) {
      return false;
    }
    return true;
  });
  writeRaw([next, ...filtered]);
  return next;
}

export function clearAdminRecentTechCalls(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
