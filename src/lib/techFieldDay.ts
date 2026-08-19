import { resolveSupabaseAccessTokenForApi } from '@/lib/ensureSupabaseSession';

export type TechFieldDayRow = {
  technicianId: string;
  name: string;
  live: boolean;
  hoursLabel: string | null;
  fromLabel: string | null;
  toLabel: string | null;
  kmLabel: string;
  overlayBody: string | null;
  jobsStarted: number;
  jobsCompleted: number;
};

export function todayIstDateKey() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}

/** Worked hours overlay is a 9 PM IST digest — only show in Settings after that. */
export function isAfterNinePmIst(now = new Date()): boolean {
  const hour = Number(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Kolkata',
      hour: 'numeric',
      hourCycle: 'h23',
    }).format(now)
  );
  return Number.isFinite(hour) && hour >= 21;
}

export async function fetchTechFieldDay(date?: string): Promise<{
  ok: boolean;
  error?: string;
  officeSet?: boolean;
  rows: TechFieldDayRow[];
}> {
  const accessToken = await resolveSupabaseAccessTokenForApi();
  if (!accessToken) return { ok: false, error: 'Not signed in', rows: [] };

  const res = await fetch('/.netlify/functions/tech-field-day', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(date ? { date } : {}),
  });
  const data = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    error?: string;
    officeSet?: boolean;
    rows?: TechFieldDayRow[];
  };
  if (!res.ok || !data.ok) {
    return { ok: false, error: data.error || `HTTP ${res.status}`, rows: [] };
  }
  return {
    ok: true,
    officeSet: data.officeSet,
    rows: Array.isArray(data.rows) ? data.rows : [],
  };
}
