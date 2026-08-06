/**
 * AMC fields technicians/admins store on a completed job (`requirements[].amc_info`).
 * Used to prefill the admin AMC generator.
 */
import { supabase } from '@/lib/supabaseClient';
import { parseJobRequirements } from '@/lib/adminUtils';
import type { DocumentBrand } from '@/lib/service-brands';
import { normalizeDocumentBrand } from '@/lib/service-brands';

export type JobAmcInfo = {
  date_given?: string | null;
  end_date?: string | null;
  years?: number | null;
  amount?: number | null;
  includes_prefilter?: boolean;
  additional_info?: string | null;
  notes?: string | null;
  service_period_months?: number | null;
  technician_reference?: boolean;
};

export type JobAmcPrefill = {
  jobId: string;
  amcInfo: JobAmcInfo;
  serviceBrand?: DocumentBrand;
};

function toDateOnly(value: string | null | undefined): string | null {
  if (!value) return null;
  if (typeof value === 'string') return value.split('T')[0].split(' ')[0] || null;
  return null;
}

export function extractAmcInfoFromRequirements(requirements: unknown): JobAmcInfo | null {
  const list = parseJobRequirements(requirements);
  const raw = list.find((r: any) => r?.amc_info)?.amc_info;
  if (!raw || typeof raw !== 'object') return null;
  const years = Number((raw as JobAmcInfo).years);
  // years === 0 means "no AMC" on complete-job forms
  if (Number.isFinite(years) && years <= 0) return null;
  return raw as JobAmcInfo;
}

/** Notes/extra text from job amc_info (ignore JSON metadata objects). */
export function jobAmcNotesText(amc: JobAmcInfo): string {
  const fromNotes = typeof amc.notes === 'string' ? amc.notes.trim() : '';
  if (fromNotes) return fromNotes;
  if (typeof amc.additional_info === 'string') {
    const t = amc.additional_info.trim();
    if (!t || t.startsWith('{')) return '';
    return t;
  }
  return '';
}

/**
 * Latest completed job for this customer that has usable AMC reference fields.
 * Minimal select — only id / requirements / brand / completed_at.
 */
export async function fetchLatestJobAmcPrefill(
  customerId: string
): Promise<JobAmcPrefill | null> {
  if (!customerId) return null;
  const { data, error } = await supabase
    .from('jobs')
    .select('id, requirements, service_brand, completed_at')
    .eq('customer_id', customerId)
    .eq('status', 'COMPLETED')
    .order('completed_at', { ascending: false })
    .limit(25);

  if (error || !data?.length) return null;

  for (const row of data) {
    const amcInfo = extractAmcInfoFromRequirements((row as any).requirements);
    if (!amcInfo) continue;
    const hasUseful =
      amcInfo.date_given ||
      amcInfo.end_date ||
      (amcInfo.amount != null && Number(amcInfo.amount) > 0) ||
      amcInfo.includes_prefilter != null ||
      amcInfo.service_period_months != null ||
      (amcInfo.years != null && Number(amcInfo.years) > 0);
    if (!hasUseful) continue;
    return {
      jobId: String((row as any).id),
      amcInfo: {
        ...amcInfo,
        date_given: toDateOnly(amcInfo.date_given) || amcInfo.date_given,
        end_date: toDateOnly(amcInfo.end_date) || amcInfo.end_date,
        amount:
          amcInfo.amount != null && !Number.isNaN(Number(amcInfo.amount))
            ? Number(amcInfo.amount)
            : null,
      },
      serviceBrand: normalizeDocumentBrand((row as any).service_brand) || undefined,
    };
  }
  return null;
}
