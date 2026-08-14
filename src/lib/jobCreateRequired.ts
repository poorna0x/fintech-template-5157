import {
  isLeadSourceAllowCustomText,
  isServiceSubTypeAllowCustomText,
} from '@/lib/leadCatalog';

export type JobCreateRequiredFields = {
  scheduled_date?: string;
  scheduled_time_slot?: string;
  scheduled_time_custom?: string;
  service_sub_type?: string;
  service_sub_type_custom?: string;
  lead_source?: string;
  lead_source_custom?: string;
  lead_cost?: string;
};

/** True when date, sub-service, lead source (and custom/cost when required) are filled. */
export function isJobCreateFormComplete(
  form: JobCreateRequiredFields,
  opts?: { requireLeadCost?: boolean }
): boolean {
  if (!String(form.scheduled_date || '').trim()) return false;
  if (
    form.scheduled_time_slot === 'CUSTOM' &&
    !String(form.scheduled_time_custom || '').trim()
  ) {
    return false;
  }
  const subType = String(form.service_sub_type || '').trim();
  if (!subType) return false;
  if (
    isServiceSubTypeAllowCustomText(subType) &&
    !String(form.service_sub_type_custom || '').trim()
  ) {
    return false;
  }
  const leadSource = String(form.lead_source || '').trim();
  if (!leadSource) return false;
  if (
    isLeadSourceAllowCustomText(leadSource) &&
    !String(form.lead_source_custom || '').trim()
  ) {
    return false;
  }
  if (opts?.requireLeadCost !== false) {
    const costRaw = String(form.lead_cost ?? '').trim();
    if (costRaw === '') return false;
    const cost = Number(costRaw);
    if (!Number.isFinite(cost) || cost < 0) return false;
  }
  return true;
}
