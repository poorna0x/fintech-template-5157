/** Shared list/delete filters for sent_email_logs (keeps Supabase queries in sync). */

export const SENT_EMAIL_LOG_IST = 'Asia/Kolkata';

export type SentEmailLogOpenFilter = 'all' | 'opened' | 'not_opened' | 'tracking_off';

export type SentEmailLogDateFilter = 'today' | 'yesterday' | 'last7' | 'all' | 'range';

export type SentEmailLogBrandFilter = 'all' | 'hydrogenro' | 'elevenro';

export type SentEmailLogTemplateFilter =
  | 'all'
  | 'job_completion'
  | 'booking_confirmation'
  | 'amc_agreement'
  | 'amc_document'
  | 'admin_composer'
  | 'invoice'
  | 'service_bill'
  | 'quotation'
  | 'service_reminder'
  | 'general';

export type SentEmailLogQueryFilters = {
  filter?: SentEmailLogOpenFilter;
  brand?: SentEmailLogBrandFilter;
  templateType?: SentEmailLogTemplateFilter;
  search?: string;
  /** Defaults to `today` in the sent log UI. */
  dateFilter?: SentEmailLogDateFilter;
  /** YYYY-MM-DD (IST), inclusive — used when `dateFilter` is `range`. */
  dateFrom?: string;
  /** YYYY-MM-DD (IST), inclusive — used when `dateFilter` is `range`. */
  dateTo?: string;
};

export function getTodayIstDate(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: SENT_EMAIL_LOG_IST,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function isValidIstDate(value: string | undefined): value is string {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}

function addIstDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T12:00:00+05:30`);
  d.setUTCDate(d.getUTCDate() + days);
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: SENT_EMAIL_LOG_IST,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

function istDayStartUtc(isoDate: string): string {
  return new Date(`${isoDate}T00:00:00+05:30`).toISOString();
}

export function normalizeSentEmailLogDateRange(
  dateFrom?: string,
  dateTo?: string
): { from: string; to: string } {
  const today = getTodayIstDate();
  let from = isValidIstDate(dateFrom) ? dateFrom : today;
  let to = isValidIstDate(dateTo) ? dateTo : today;
  if (from > to) {
    [from, to] = [to, from];
  }
  return { from, to };
}

export function resolveSentEmailLogDateRange(
  opts: SentEmailLogQueryFilters
): { from?: string; to?: string } {
  const filter = opts.dateFilter ?? 'today';
  const today = getTodayIstDate();

  switch (filter) {
    case 'all':
      return {};
    case 'today':
      return { from: istDayStartUtc(today), to: istDayStartUtc(addIstDays(today, 1)) };
    case 'yesterday': {
      const yesterday = addIstDays(today, -1);
      return { from: istDayStartUtc(yesterday), to: istDayStartUtc(today) };
    }
    case 'last7':
      return {
        from: istDayStartUtc(addIstDays(today, -6)),
        to: istDayStartUtc(addIstDays(today, 1)),
      };
    case 'range': {
      const { from, to } = normalizeSentEmailLogDateRange(opts.dateFrom, opts.dateTo);
      return { from: istDayStartUtc(from), to: istDayStartUtc(addIstDays(to, 1)) };
    }
    default:
      return {};
  }
}

export function formatSentEmailLogDateLabel(isoDate: string): string {
  return new Date(`${isoDate}T12:00:00+05:30`).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export const SENT_EMAIL_LOG_DATE_FILTER_LABELS: Record<SentEmailLogDateFilter, string> = {
  today: 'Today',
  yesterday: 'Yesterday',
  last7: 'Last 7 days',
  all: 'All dates',
  range: 'Date range',
};

export function isSentEmailLogTodayOnly(opts: SentEmailLogQueryFilters): boolean {
  return (opts.dateFilter ?? 'today') === 'today';
}

export function describeSentEmailLogDateRange(filters: SentEmailLogQueryFilters): string | null {
  const dateFilter = filters.dateFilter ?? 'today';

  if (dateFilter === 'today') {
    return null;
  }

  if (dateFilter === 'range') {
    const { from, to } = normalizeSentEmailLogDateRange(filters.dateFrom, filters.dateTo);
    if (from === to) {
      return formatSentEmailLogDateLabel(from);
    }
    return `${formatSentEmailLogDateLabel(from)} – ${formatSentEmailLogDateLabel(to)}`;
  }

  return SENT_EMAIL_LOG_DATE_FILTER_LABELS[dateFilter];
}

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

  const { from, to } = resolveSentEmailLogDateRange(opts);
  if (from) {
    q = q.gte('sent_at', from);
  }
  if (to) {
    q = q.lt('sent_at', to);
  }

  return q;
}

export function buildSentEmailLogRpcArgs(
  opts: SentEmailLogQueryFilters & { limit: number; offset: number }
) {
  const dateRange = resolveSentEmailLogDateRange(opts);
  return {
    p_limit: opts.limit,
    p_offset: opts.offset,
    p_filter: opts.filter ?? 'all',
    p_brand: opts.brand ?? 'all',
    p_template_type: opts.templateType ?? 'all',
    p_search: (opts.search || '').trim() || null,
    p_sent_from: dateRange.from ?? null,
    p_sent_to: dateRange.to ?? null,
  };
}

export const SENT_EMAIL_LOG_LIST_COLUMNS =
  'id, recipient_email, subject, template_type, document_brand, sent_at, opened_at, tracking_pixel_enabled';
