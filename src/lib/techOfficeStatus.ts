import { supabase } from '@/lib/supabase';

export type TechOfficeStatus =
  | 'in_office'
  | 'en_route'
  | 'checking'
  | 'unknown';

export type PublicTechOfficeStatus = {
  ok: true;
  status: TechOfficeStatus;
  etaMinutes?: number;
  firstName: string;
  checkedAt: string;
  live: boolean;
  pending?: boolean;
};

export type MintOfficeStatus = {
  ok: true;
  hasLink: boolean;
  enabled: boolean;
  technicianActive?: boolean;
  url?: string;
};

function mintUrl(): string {
  return '/.netlify/functions/tech-office-status-mint';
}

function statusUrl(): string {
  return '/.netlify/functions/tech-office-status';
}

async function adminToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data?.session?.access_token || null;
}

export async function mintTechnicianOfficeStatus(
  action: 'get' | 'enable' | 'disable' | 'rotate',
  technicianId: string
): Promise<MintOfficeStatus | { ok: false; error: string }> {
  const token = await adminToken();
  if (!token) return { ok: false, error: 'Sign in again' };
  try {
    const res = await fetch(mintUrl(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ action, technicianId }),
    });
    const json = (await res.json().catch(() => null)) as
      | MintOfficeStatus
      | { error?: string }
      | null;
    if (!res.ok || !json || (json as MintOfficeStatus).ok !== true) {
      return {
        ok: false,
        error:
          (json && 'error' in json && json.error) ||
          (res.status === 401 ? 'Unauthorized' : 'Could not update link'),
      };
    }
    return json as MintOfficeStatus;
  } catch {
    return { ok: false, error: 'Network error' };
  }
}

export async function fetchPublicTechOfficeStatus(
  token: string,
  turnstileToken?: string
): Promise<
  | PublicTechOfficeStatus
  | { ok: false; error: 'not_found' | 'bot' | 'failed' | 'rate' }
> {
  try {
    const res = await fetch(statusUrl(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({
        token,
        ...(turnstileToken ? { turnstileToken } : {}),
      }),
    });
    const json = (await res.json().catch(() => null)) as
      | PublicTechOfficeStatus
      | { ok?: false; error?: string }
      | null;
    if (res.status === 429) return { ok: false, error: 'rate' };
    if (res.status === 403) return { ok: false, error: 'bot' };
    if (res.status === 404 || (json && json.ok === false && json.error === 'not_found')) {
      return { ok: false, error: 'not_found' };
    }
    if (!res.ok || !json || json.ok !== true) {
      return { ok: false, error: 'failed' };
    }
    return json as PublicTechOfficeStatus;
  } catch {
    return { ok: false, error: 'failed' };
  }
}
