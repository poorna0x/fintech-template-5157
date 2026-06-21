/** Shared list/delete filters for sent_email_logs (keeps Supabase queries in sync). */

export type SentEmailLogOpenFilter = 'all' | 'opened' | 'not_opened' | 'tracking_off';

export type SentEmailLogBrandFilter = 'all' | 'hydrogenro' | 'elevenro';

export type SentEmailLogTemplateFilter =
  | 'all'
  | 'job_completion'
  | 'booking_confirmation'
  | 'amc_agreement'
  | 'amc_document'
  | 'admin_composer'
  | 'invoice'
  | 'quotation'
  | 'service_reminder'
  | 'general';

export type SentEmailLogQueryFilters = {
  filter?: SentEmailLogOpenFilter;
  brand?: SentEmailLogBrandFilter;
  templateType?: SentEmailLogTemplateFilter;
  search?: string;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function applySentEmailLogFilters(query: any, opts: SentEmailLogQueryFilters) {
  let q = query;
  if (opts.filter === 'opened') {
    q = q.not('opened_at', 'is', null);
  } else if (opts.filter === 'not_opened') {
    q = q.is('opened_at', null).eq('tracking_pixel_enabled', true);
  } else if (opts.filter === 'tracking_off') {
    q = q.eq('tracking_pixel_enabled', false);
  }

  if (opts.brand && opts.brand !== 'all') {
    q = q.eq('document_brand', opts.brand);
  }

  if (opts.templateType && opts.templateType !== 'all') {
    q = q.eq('template_type', opts.templateType);
  }

  const term = (opts.search || '').trim().slice(0, 80);
  if (term) {
    const safe = term.replace(/[%_,]/g, ' ');
    q = q.or(`recipient_email.ilike.%${safe}%,subject.ilike.%${safe}%`);
  }

  return q;
}

export const SENT_EMAIL_LOG_LIST_COLUMNS =
  'id, recipient_email, subject, template_type, document_brand, sent_at, opened_at, tracking_pixel_enabled';
