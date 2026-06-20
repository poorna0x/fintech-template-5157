import type { DocumentBrand } from '@/lib/service-brands';

export interface PersistAmcContractPayload {
  customer_id: string;
  job_id?: string | null;
  start_date: string;
  end_date: string;
  years: number;
  includes_prefilter: boolean;
  additional_info?: string | null;
  service_period_months?: number | null;
  given_by_technician_id?: string | null;
  service_brand?: DocumentBrand | null;
}

export async function persistAmcContract(
  payload: PersistAmcContractPayload,
  accessToken: string
): Promise<{ ok: boolean; error?: string; id?: string }> {
  if (!accessToken) {
    return { ok: false, error: 'Sign in to save AMC' };
  }

  try {
    const response = await fetch('/.netlify/functions/save-amc-contract', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(payload),
    });

    const result = (await response.json().catch(() => ({}))) as {
      error?: string;
      hint?: string;
      id?: string;
    };

    if (!response.ok) {
      const hint = result.hint ? ` — ${result.hint}` : '';
      if (response.status === 404) {
        return {
          ok: false,
          error: `Save AMC function not found${hint}. Restart with npm run dev or deploy latest code.`,
        };
      }
      return { ok: false, error: (result.error || response.statusText || 'Failed to save AMC') + hint };
    }

    return { ok: true, id: result.id };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Failed to save AMC',
    };
  }
}

export interface TechnicianAmcPersistContext {
  billNumber: string;
  customerId: string;
  customerName: string;
  customerPhone: string;
  customerEmail?: string | null;
  customerAddress: unknown;
  jobId: string;
  jobNumber?: string | null;
  startDate: string;
  endDate: string;
  years: number;
  amount: number;
  includesPrefilter: boolean;
  servicePeriodMonths: number;
  serviceBrand: DocumentBrand;
  technicianId: string;
  roModel?: string;
  additionalInfo?: string;
}

export function buildTechnicianAmcPersistPayload(
  ctx: TechnicianAmcPersistContext
): PersistAmcContractPayload {
  const metadata = {
    agreement_number: ctx.billNumber,
    agreement_date: ctx.startDate,
    amc_cost: ctx.amount,
    total_amount: ctx.amount,
    ro_model: ctx.roModel || null,
    validity_period: `${ctx.years} Year${ctx.years === 1 ? '' : 's'}`,
    notes: ctx.additionalInfo?.trim() || null,
    customer_name: ctx.customerName,
    customer_phone: ctx.customerPhone,
    customer_email: ctx.customerEmail || null,
    customer_address: ctx.customerAddress,
    document_brand: ctx.serviceBrand,
    technician_reference: true,
    shared_via: 'technician_complete_job',
    job_number: ctx.jobNumber || null,
    saved_at: new Date().toISOString(),
  };

  return {
    customer_id: ctx.customerId,
    job_id: ctx.jobId,
    start_date: ctx.startDate,
    end_date: ctx.endDate,
    years: ctx.years,
    includes_prefilter: ctx.includesPrefilter,
    additional_info: JSON.stringify(metadata),
    service_period_months: ctx.servicePeriodMonths,
    given_by_technician_id: ctx.technicianId,
    service_brand: ctx.serviceBrand,
  };
}
