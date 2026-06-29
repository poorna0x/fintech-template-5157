import { getAmcDocumentBrand, parseAmcAdditionalInfo } from '@/lib/amc-brand';
import {
  addMonthsToDate,
  formatAmcDateEnIN,
  getDefaultAmcServicePeriodMonths,
} from '@/lib/amcAutoJobSchedule';
import type { AdminDocumentEmailData, AdminEmailTemplateType } from '@/lib/admin-email-templates';
import { getDefaultDocumentMessage } from '@/lib/admin-email-templates';
import type { BookingConfirmationEmailData } from '@/lib/booking-confirmation-email';
import { buildJobCompletionMessageFromJob } from '@/lib/job-completion-message';
import type { DocumentBrand } from '@/lib/service-brands';
import { getDocumentBrandLabel, normalizeDocumentBrand } from '@/lib/service-brands';
import { getValidCustomerEmail } from '@/lib/customer-email';
import { db } from '@/lib/supabase';
import { supabase } from '@/lib/supabaseClient';

export type EmailSourceMode = 'crm' | 'manual';

export interface EmailSourceOption {
  id: string;
  label: string;
  sublabel?: string;
  customerEmail?: string;
}

export interface EmailSourceApplyResult {
  bookingForm?: Partial<BookingConfirmationEmailData>;
  documentForm?: Partial<AdminDocumentEmailData>;
  recipientEmail?: string;
  recipientPhone?: string;
  alternatePhone?: string;
  /** Resolved send-as brand (prefers customer's last completed service brand). */
  sendBrand?: DocumentBrand;
  /** Last completed job service brand for the customer, if any. */
  lastServiceBrand?: DocumentBrand | null;
  /** CRM record id applied (job, AMC, invoice, or customer). */
  sourceRecordId?: string;
  /** Customer uuid when known (for brand defaulting). */
  customerId?: string;
}

function todayIsoDate(): string {
  return new Date().toISOString().split('T')[0];
}

function formatInr(amount: unknown): string {
  const n =
    typeof amount === 'number'
      ? amount
      : parseFloat(String(amount ?? '').replace(/[^\d.-]/g, ''));
  if (Number.isNaN(n) || n <= 0) return '';
  return `₹${n.toLocaleString('en-IN')}`;
}

function toDateOnly(value: unknown): string {
  if (!value) return '';
  const s = String(value);
  return s.split('T')[0].split(' ')[0];
}

function getJobServiceAddress(job: Record<string, unknown>): string {
  const sa = job.service_address;
  if (typeof sa === 'string' && sa.trim()) return sa.trim();
  if (sa && typeof sa === 'object') {
    const addr = sa as Record<string, unknown>;
    if (typeof addr.street === 'string' && addr.street.trim()) return addr.street.trim();
    if (typeof addr.visible_address === 'string' && addr.visible_address.trim()) {
      return addr.visible_address.trim();
    }
  }
  const sl = job.service_location;
  if (sl && typeof sl === 'object') {
    const loc = sl as Record<string, unknown>;
    if (typeof loc.formattedAddress === 'string' && loc.formattedAddress.trim()) {
      return loc.formattedAddress.trim();
    }
  }
  const customer = job.customer as Record<string, unknown> | undefined;
  if (customer) {
    if (typeof customer.visible_address === 'string' && customer.visible_address.trim()) {
      return customer.visible_address.trim();
    }
    const ca = customer.address;
    if (typeof ca === 'string' && ca.trim()) return ca.trim();
    if (ca && typeof ca === 'object') {
      const a = ca as Record<string, unknown>;
      if (typeof a.street === 'string' && a.street.trim()) return a.street.trim();
    }
  }
  return '';
}

function getJobDocumentBrand(job: Record<string, unknown>): DocumentBrand | undefined {
  return normalizeDocumentBrand(job.service_brand) ?? undefined;
}

function getInvoiceDocumentBrand(companyInfo: unknown): DocumentBrand {
  if (!companyInfo || typeof companyInfo !== 'object') return 'hydrogenro';
  const c = companyInfo as Record<string, unknown>;
  const hay = [c.website, c.email, c.name, c.company_name]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  if (hay.includes('elevenro') || hay.includes('eleven ro')) return 'elevenro';
  return 'hydrogenro';
}

function getAmcAgreementNumber(amc: Record<string, unknown>): string {
  const meta = parseAmcAdditionalInfo(amc.additional_info);
  const fromMeta = meta.agreement_number;
  if (typeof fromMeta === 'string' && fromMeta.trim()) return fromMeta.trim();
  const shortId = String(amc.id || '').slice(0, 8).toUpperCase();
  return shortId ? `AMC-${shortId}` : 'AMC';
}

function getAmcTotalAmount(amc: Record<string, unknown>): string {
  const meta = parseAmcAdditionalInfo(amc.additional_info);
  return formatInr(meta.total_amount ?? meta.amc_cost);
}

function computeAmcNextServiceDate(amc: Record<string, unknown>): string {
  const customers = amc.customers as Record<string, unknown> | undefined;
  const periodMonths =
    typeof amc.service_period_months === 'number' && amc.service_period_months > 0
      ? amc.service_period_months
      : getDefaultAmcServicePeriodMonths();
  const reference =
    toDateOnly(customers?.last_service_date) ||
    toDateOnly(amc.start_date) ||
    todayIsoDate();
  return addMonthsToDate(reference, periodMonths);
}

function buildServiceReminderMessage(
  customerName: string,
  dueDate: string,
  sendBrand: DocumentBrand
): string {
  const brandLabel = getDocumentBrandLabel(sendBrand);
  const dueFormatted = dueDate ? formatAmcDateEnIN(dueDate) : 'soon';
  return (
    `Hi ${customerName}, this is a friendly reminder from ${brandLabel} that your RO water purifier ` +
    `is due for service around ${dueFormatted}. Regular maintenance keeps your water safe and your purifier running smoothly. ` +
    `Reply on WhatsApp or call us to schedule a visit at your convenience.`
  );
}

async function resolveSendBrand(
  customerId: string | undefined,
  recordFallback?: DocumentBrand
): Promise<{ sendBrand: DocumentBrand; lastServiceBrand: DocumentBrand | null }> {
  const fallback = recordFallback || 'elevenro';
  if (!customerId) {
    return { sendBrand: fallback, lastServiceBrand: null };
  }

  const { data, error } = await db.jobs.getLastServiceBrandByCustomerIds([customerId]);
  if (error) {
    return { sendBrand: fallback, lastServiceBrand: null };
  }

  const lastServiceBrand = normalizeDocumentBrand(data?.[customerId]);
  return {
    sendBrand: lastServiceBrand || fallback,
    lastServiceBrand,
  };
}

/** Public helper — default send-as brand from customer's last completed service. */
export async function resolveCustomerSendBrand(
  customerId: string,
  recordFallback?: DocumentBrand
): Promise<{ sendBrand: DocumentBrand; lastServiceBrand: DocumentBrand | null }> {
  return resolveSendBrand(customerId, recordFallback);
}

/** Default compose template: booking confirmation when customer has an ongoing job, else general. */
export async function resolveDefaultEmailTemplateForCustomer(
  customerId: string
): Promise<'booking_confirmation' | 'general'> {
  const jobId = await findLatestOngoingJobIdForCustomer(customerId);
  return jobId ? 'booking_confirmation' : 'general';
}

async function withSendBrand(
  customerId: string | undefined,
  recordFallback: DocumentBrand | undefined,
  base: Omit<EmailSourceApplyResult, 'sendBrand' | 'lastServiceBrand'>
): Promise<EmailSourceApplyResult> {
  const { sendBrand, lastServiceBrand } = await resolveSendBrand(customerId, recordFallback);
  return {
    ...base,
    customerId: customerId || undefined,
    sendBrand,
    lastServiceBrand,
    bookingForm: base.bookingForm
      ? { ...base.bookingForm, documentBrand: sendBrand }
      : undefined,
    documentForm: base.documentForm
      ? { ...base.documentForm, documentBrand: sendBrand }
      : undefined,
  };
}

export function supportsCrmSource(templateType: AdminEmailTemplateType): boolean {
  return true;
}

export function getCrmSourceLabel(templateType: AdminEmailTemplateType): string {
  switch (templateType) {
    case 'booking_confirmation':
      return 'Ongoing job';
    case 'amc_document':
      return 'Active AMC';
    case 'invoice':
      return 'Saved invoice';
    case 'service_bill':
      return 'Completed job';
    case 'quotation':
    case 'general':
      return 'Customer';
    case 'service_reminder':
      return 'Active AMC (service due)';
    case 'job_completion':
      return 'Completed job';
    default:
      return 'Record';
  }
}

export function getEmailSourceSearchHint(templateType: AdminEmailTemplateType): string {
  switch (templateType) {
    case 'booking_confirmation':
      return 'Enter customer name, phone, or ID, then click Search to find their ongoing job.';
    case 'amc_document':
    case 'service_reminder':
      return 'Enter customer details, then click Search to find their active AMC.';
    case 'invoice':
      return 'Enter invoice # or customer details, then click Search.';
    case 'service_bill':
      return 'Enter customer name, phone, or job #, then click Search to find a completed job.';
    case 'quotation':
    case 'general':
      return 'Enter customer name, phone, or ID, then click Search.';
    case 'job_completion':
      return 'Enter customer name, phone, or job #, then click Search to find a completed job.';
    default:
      return 'Enter search terms, then click Search.';
  }
}

export const EMAIL_SOURCE_MIN_SEARCH_LEN = 2;

/** Slim columns for job picker lists (low egress). */
const JOB_PICKER_COLUMNS =
  'id,job_number,customer_id,service_type,service_sub_type,status,scheduled_date';

const CUSTOMER_PICKER_EMBED = 'id,customer_id,full_name,phone,email';

const ONGOING_JOB_STATUSES = ['PENDING', 'ASSIGNED', 'EN_ROUTE', 'IN_PROGRESS'] as const;

function mapJobsToOptions(jobs: Record<string, unknown>[]): EmailSourceOption[] {
  return jobs.map((job) => {
    const customer = job.customer as Record<string, unknown> | undefined;
    const jobNumber = String(job.job_number || '—');
    const customerName = String(customer?.full_name || 'Unknown');
    const subType = String(job.service_sub_type || job.service_type || '');
    const status = String(job.status || '');
    const scheduled = toDateOnly(job.scheduled_date);
    return {
      id: String(job.id),
      label: `${jobNumber} — ${customerName}`,
      sublabel: [subType, status, scheduled].filter(Boolean).join(' · '),
      customerEmail: typeof customer?.email === 'string' ? customer.email : undefined,
    };
  });
}

function mapCustomersToOptions(customers: Record<string, unknown>[]): EmailSourceOption[] {
  return customers.map((c) => ({
    id: String(c.id),
    label: `${String(c.full_name || 'Unknown')} — ${String(c.phone || '')}`,
    sublabel: String(c.customer_id || c.email || ''),
    customerEmail: typeof c.email === 'string' ? c.email : undefined,
  }));
}

export async function fetchEmailSourceOptions(
  templateType: AdminEmailTemplateType,
  searchQuery?: string
): Promise<EmailSourceOption[]> {
  const q = searchQuery?.trim() ?? '';
  if (q.length < EMAIL_SOURCE_MIN_SEARCH_LEN) return [];

  switch (templateType) {
    case 'booking_confirmation':
      return searchOngoingJobsByCustomer(q);
    case 'amc_document':
    case 'service_reminder':
      return searchActiveAmcByCustomer(templateType, q);
    case 'invoice':
      return searchInvoiceOptions(q);
    case 'service_bill':
      return searchCompletedJobsByCustomer(q);
    case 'quotation':
    case 'general':
      return fetchCustomerSearchOptions(q);
    case 'job_completion':
      return searchCompletedJobsByCustomer(q);
    default:
      return [];
  }
}

async function searchCompletedJobsByCustomer(query: string): Promise<EmailSourceOption[]> {
  const { data: customers, error: cErr } = await db.customers.searchSlim(query, 20);
  if (cErr || !customers?.length) return [];

  const customerIds = (customers as { id: string }[]).map((c) => c.id);
  const { data: jobs, error } = await supabase
    .from('jobs')
    .select(`${JOB_PICKER_COLUMNS},customer:customers(${CUSTOMER_PICKER_EMBED})`)
    .in('customer_id', customerIds)
    .eq('status', 'COMPLETED')
    .order('completed_at', { ascending: false })
    .limit(50);

  if (error || !jobs?.length) return [];
  return mapJobsToOptions(jobs as Record<string, unknown>[]);
}

async function searchOngoingJobsByCustomer(query: string): Promise<EmailSourceOption[]> {
  const { data: customers, error: cErr } = await db.customers.searchSlim(query, 20);
  if (cErr || !customers?.length) return [];

  const customerIds = (customers as { id: string }[]).map((c) => c.id);
  const { data: jobs, error } = await supabase
    .from('jobs')
    .select(`${JOB_PICKER_COLUMNS},customer:customers(${CUSTOMER_PICKER_EMBED})`)
    .in('customer_id', customerIds)
    .in('status', [...ONGOING_JOB_STATUSES])
    .order('created_at', { ascending: false })
    .limit(50);

  if (error || !jobs?.length) return [];
  return mapJobsToOptions(jobs as Record<string, unknown>[]);
}

async function searchActiveAmcByCustomer(
  templateType: AdminEmailTemplateType,
  query: string
): Promise<EmailSourceOption[]> {
  const { data: customers, error: cErr } = await db.customers.searchSlim(query, 20);
  if (cErr || !customers?.length) return [];

  const customerIds = (customers as { id: string }[]).map((c) => c.id);
  const today = todayIsoDate();
  const { data, error } = await supabase
    .from('amc_contracts')
    .select(
      'id,customer_id,start_date,end_date,status,service_period_months,additional_info,customers(id,full_name,phone,email,customer_id,last_service_date)'
    )
    .in('customer_id', customerIds)
    .eq('status', 'ACTIVE')
    .gte('end_date', today)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error || !data?.length) return [];
  return mapAmcRowsToOptions(data as Record<string, unknown>[], templateType);
}

function mapAmcRowsToOptions(
  rows: Record<string, unknown>[],
  templateType: AdminEmailTemplateType
): EmailSourceOption[] {
  const sorted =
    templateType === 'service_reminder'
      ? [...rows].sort((a, b) =>
          computeAmcNextServiceDate(a).localeCompare(computeAmcNextServiceDate(b))
        )
      : rows;

  return sorted.map((amc) => {
    const customers = amc.customers as Record<string, unknown> | undefined;
    const customerName = String(customers?.full_name || 'Unknown');
    const ref = getAmcAgreementNumber(amc);
    const endDate = toDateOnly(amc.end_date);
    const nextDue =
      templateType === 'service_reminder' ? computeAmcNextServiceDate(amc) : undefined;
    return {
      id: String(amc.id),
      label: `${ref} — ${customerName}`,
      sublabel:
        templateType === 'service_reminder'
          ? `Next service ~ ${nextDue ? formatAmcDateEnIN(nextDue) : '—'} · AMC until ${endDate ? formatAmcDateEnIN(endDate) : '—'}`
          : `Active until ${endDate ? formatAmcDateEnIN(endDate) : '—'}`,
      customerEmail: typeof customers?.email === 'string' ? customers.email : undefined,
    };
  });
}

async function searchInvoiceOptions(query: string): Promise<EmailSourceOption[]> {
  const { data, error } = await db.taxInvoices.getFilteredPaginated({
    searchQuery: query,
    page: 1,
    pageSize: 25,
    invoiceType: 'ALL',
    dateFilter: 'all',
  });
  if (error || !data?.length) return [];

  return data.map((inv: Record<string, unknown>) => ({
    id: String(inv.id),
    label: `${String(inv.invoice_number || 'Invoice')} — ${String(inv.customer_name || 'Unknown')}`,
    sublabel: [
      toDateOnly(inv.invoice_date),
      formatInr(inv.total_amount),
      String(inv.invoice_type || ''),
    ]
      .filter(Boolean)
      .join(' · '),
    customerEmail: typeof inv.customer_email === 'string' ? inv.customer_email : undefined,
  }));
}

async function fetchCustomerSearchOptions(query: string): Promise<EmailSourceOption[]> {
  const { data, error } = await db.customers.searchSlim(query, 25);
  if (error || !data?.length) return [];
  return mapCustomersToOptions(data as Record<string, unknown>[]);
}

function getCustomerPhones(customer: Record<string, unknown> | undefined): {
  recipientPhone?: string;
  alternatePhone?: string;
} {
  if (!customer) return {};
  const phone = String(customer.phone || '').trim();
  const alt = String(customer.alternate_phone || customer.alternatePhone || '').trim();
  return {
    recipientPhone: phone || undefined,
    alternatePhone: alt && alt !== phone ? alt : undefined,
  };
}

function getCustomerServiceAddress(customer: Record<string, unknown>): string {
  if (typeof customer.visible_address === 'string' && customer.visible_address.trim()) {
    return customer.visible_address.trim();
  }
  const addr = customer.address;
  if (typeof addr === 'string' && addr.trim()) return addr.trim();
  if (addr && typeof addr === 'object') {
    const a = addr as Record<string, unknown>;
    if (typeof a.street === 'string' && a.street.trim()) return a.street.trim();
  }
  const loc = customer.location;
  if (loc && typeof loc === 'object') {
    const l = loc as Record<string, unknown>;
    if (typeof l.formattedAddress === 'string' && l.formattedAddress.trim()) {
      return l.formattedAddress.trim();
    }
  }
  return '';
}

async function findLatestOngoingJobIdForCustomer(customerId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('jobs')
    .select('id')
    .eq('customer_id', customerId)
    .in('status', [...ONGOING_JOB_STATUSES])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data?.id) return null;
  return String(data.id);
}

async function findLatestCompletedJobIdForCustomer(customerId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('jobs')
    .select('id')
    .eq('customer_id', customerId)
    .eq('status', 'COMPLETED')
    .order('completed_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data?.id) return null;
  return String(data.id);
}

async function findActiveAmcIdForCustomer(customerId: string): Promise<string | null> {
  const today = todayIsoDate();
  const { data, error } = await supabase
    .from('amc_contracts')
    .select('id')
    .eq('customer_id', customerId)
    .eq('status', 'ACTIVE')
    .gte('end_date', today)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data?.id) return null;
  return String(data.id);
}

async function findLatestInvoiceIdForCustomer(customerId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('tax_invoices')
    .select('id')
    .eq('customer_id', customerId)
    .order('invoice_date', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data?.id) return null;
  return String(data.id);
}

async function applyCustomerBookingFallback(customerId: string): Promise<EmailSourceApplyResult | null> {
  const { data, error } = await db.customers.getById(customerId);
  if (error || !data) return null;

  const customer = data as Record<string, unknown>;
  const { sendBrand, lastServiceBrand } = await resolveSendBrand(customerId, undefined);

  return {
    sendBrand,
    lastServiceBrand,
    customerId,
    sourceRecordId: customerId,
    bookingForm: {
      customerName: String(customer.full_name || ''),
      jobNumber: '',
      serviceType: 'Service',
      serviceSubType: '',
      brand: String(customer.brand || ''),
      model: String(customer.model || ''),
      scheduledDate: todayIsoDate(),
      scheduledTimeSlot: 'FIRST_HALF',
      serviceAddress: getCustomerServiceAddress(customer),
      phone: String(customer.phone || ''),
      email: String(customer.email || ''),
      documentBrand: sendBrand,
    },
    recipientEmail: getValidCustomerEmail(customer.email) ?? undefined,
    ...getCustomerPhones(customer),
  };
}

/** Load CRM data from a customer id (picks ongoing job, active AMC, latest invoice, etc.). */
export async function applyEmailSourceForCustomer(
  templateType: AdminEmailTemplateType,
  customerId: string
): Promise<EmailSourceApplyResult | null> {
  switch (templateType) {
    case 'booking_confirmation': {
      const jobId = await findLatestOngoingJobIdForCustomer(customerId);
      if (jobId) {
        const result = await applyJobRecord(jobId);
        return result ? { ...result, sourceRecordId: jobId } : null;
      }
      return applyCustomerBookingFallback(customerId);
    }
    case 'amc_document':
    case 'service_reminder': {
      const amcId = await findActiveAmcIdForCustomer(customerId);
      if (amcId) {
        const result = await applyAmcRecord(templateType, amcId);
        return result ? { ...result, sourceRecordId: amcId } : null;
      }
      const fallback = await applyCustomerRecord(
        customerId,
        templateType === 'service_reminder' ? 'general' : 'quotation'
      );
      return fallback ? { ...fallback, sourceRecordId: customerId } : null;
    }
    case 'invoice': {
      const invoiceId = await findLatestInvoiceIdForCustomer(customerId);
      if (invoiceId) {
        const result = await applyInvoiceRecord(invoiceId);
        return result ? { ...result, sourceRecordId: invoiceId } : null;
      }
      return applyCustomerRecord(customerId, 'quotation');
    }
    case 'service_bill': {
      const jobId = await findLatestCompletedJobIdForCustomer(customerId);
      if (jobId) {
        const result = await applyServiceBillRecord(jobId);
        return result ? { ...result, sourceRecordId: jobId } : null;
      }
      return null;
    }
    case 'quotation':
    case 'general':
      return applyCustomerRecord(customerId, templateType);
    case 'job_completion': {
      const jobId = await findLatestCompletedJobIdForCustomer(customerId);
      if (jobId) {
        const result = await applyCompletedJobRecord(jobId);
        return result ? { ...result, sourceRecordId: jobId } : null;
      }
      return null;
    }
    default:
      return null;
  }
}

export async function applyEmailSourceRecord(
  templateType: AdminEmailTemplateType,
  recordId: string
): Promise<EmailSourceApplyResult | null> {
  switch (templateType) {
    case 'booking_confirmation':
      return applyJobRecord(recordId);
    case 'amc_document':
      return applyAmcRecord('amc_document', recordId);
    case 'service_reminder':
      return applyAmcRecord('service_reminder', recordId);
    case 'invoice':
      return applyInvoiceRecord(recordId);
    case 'service_bill':
      return applyServiceBillRecord(recordId);
    case 'quotation':
      return applyCustomerRecord(recordId, 'quotation');
    case 'general':
      return applyCustomerRecord(recordId, 'general');
    case 'job_completion':
      return applyCompletedJobRecord(recordId);
    default:
      return null;
  }
}

async function applyJobRecord(jobId: string): Promise<EmailSourceApplyResult | null> {
  const { data, error } = await db.jobs.getByIdFull(jobId);
  if (error || !data) return null;

  const job = data as Record<string, unknown>;
  const customer = job.customer as Record<string, unknown> | undefined;
  const customerId = String(job.customer_id || customer?.id || '');

  return withSendBrand(customerId, getJobDocumentBrand(job), {
    sourceRecordId: jobId,
    bookingForm: {
      customerName: String(customer?.full_name || ''),
      jobNumber: String(job.job_number || ''),
      serviceType: String(job.service_type || 'Service'),
      serviceSubType: String(job.service_sub_type || ''),
      brand: String(job.brand || customer?.brand || ''),
      model: String(job.model || customer?.model || ''),
      scheduledDate: toDateOnly(job.scheduled_date) || todayIsoDate(),
      scheduledTimeSlot: String(job.scheduled_time_slot || 'FIRST_HALF'),
      serviceAddress: getJobServiceAddress(job),
      phone: String(customer?.phone || ''),
      email: String(customer?.email || ''),
    },
    recipientEmail: typeof customer?.email === 'string' ? customer.email : undefined,
    ...getCustomerPhones(customer),
  });
}

async function applyCompletedJobRecord(jobId: string): Promise<EmailSourceApplyResult | null> {
  const { data, error } = await db.jobs.getByIdFull(jobId);
  if (error || !data) return null;

  const job = data as Record<string, unknown>;
  const status = String(job.status || '').toUpperCase();
  if (status !== 'COMPLETED') return null;

  const customer = job.customer as Record<string, unknown> | undefined;
  const customerId = String(job.customer_id || customer?.id || '');
  const completion = buildJobCompletionMessageFromJob(job);
  const { sendBrand, lastServiceBrand } = await resolveSendBrand(customerId, completion.documentBrand);

  return {
    sendBrand,
    lastServiceBrand,
    customerId,
    sourceRecordId: jobId,
    documentForm: {
      documentBrand: sendBrand,
      customerName: completion.customerName,
      documentRef: completion.jobNumber,
      amount: completion.amount,
      dueDate: '',
      message: completion.message,
      customSubject: '',
      completionServiceType: completion.serviceType,
      completionServiceSubType: completion.serviceSubType,
    },
    recipientEmail: getValidCustomerEmail(customer?.email) ?? undefined,
    ...getCustomerPhones(customer),
  };
}

async function applyAmcRecord(
  templateType: 'amc_document' | 'service_reminder',
  amcId: string
): Promise<EmailSourceApplyResult | null> {
  const { data, error } = await db.amcContracts.getById(amcId);
  if (error || !data) return null;

  const amc = data as Record<string, unknown>;
  const customers = amc.customers as Record<string, unknown> | undefined;
  const customerName = String(customers?.full_name || '');
  const customerId = String(amc.customer_id || customers?.id || '');
  const recordBrand = getAmcDocumentBrand(amc);
  const nextDue = computeAmcNextServiceDate(amc);
  const { sendBrand, lastServiceBrand } = await resolveSendBrand(customerId, recordBrand);
  const recipientEmail = typeof customers?.email === 'string' ? customers.email : undefined;

  if (templateType === 'service_reminder') {
    return {
      sendBrand,
      lastServiceBrand,
      customerId,
      sourceRecordId: amcId,
      documentForm: {
        documentBrand: sendBrand,
        customerName,
        dueDate: nextDue,
        message: buildServiceReminderMessage(customerName, nextDue, sendBrand),
      },
      recipientEmail,
      ...getCustomerPhones(customers),
    };
  }

  return {
    sendBrand,
    lastServiceBrand,
    customerId,
    sourceRecordId: amcId,
    documentForm: {
      documentBrand: sendBrand,
      customerName,
      documentRef: getAmcAgreementNumber(amc),
      amount: getAmcTotalAmount(amc),
      dueDate: toDateOnly(amc.end_date) || todayIsoDate(),
      message: getDefaultDocumentMessage('amc_document'),
    },
    recipientEmail,
    ...getCustomerPhones(customers),
  };
}

async function applyServiceBillRecord(jobId: string): Promise<EmailSourceApplyResult | null> {
  const { data, error } = await db.jobs.getByIdFull(jobId);
  if (error || !data) return null;

  const job = data as Record<string, unknown>;
  const status = String(job.status || '').toUpperCase();
  if (status !== 'COMPLETED') return null;

  const customer = job.customer as Record<string, unknown> | undefined;
  const customerId = String(job.customer_id || customer?.id || '');
  const amount =
    typeof job.actual_cost === 'number'
      ? job.actual_cost
      : parseFloat(String(job.actual_cost ?? job.payment_amount ?? '').replace(/[^\d.-]/g, '')) || 0;

  const { sendBrand, lastServiceBrand } = await resolveSendBrand(
    customerId,
    getJobDocumentBrand(job)
  );

  return {
    sendBrand,
    lastServiceBrand,
    customerId,
    sourceRecordId: jobId,
    documentForm: {
      documentBrand: sendBrand,
      customerName: String(customer?.full_name || ''),
      documentRef: String(job.job_number || ''),
      amount: formatInr(amount),
      dueDate: '',
      message: getDefaultDocumentMessage('service_bill'),
    },
    recipientEmail: getValidCustomerEmail(customer?.email) ?? undefined,
    ...getCustomerPhones(customer),
  };
}

async function applyInvoiceRecord(invoiceId: string): Promise<EmailSourceApplyResult | null> {
  const { data: inv, error } = await supabase
    .from('tax_invoices')
    .select('*')
    .eq('id', invoiceId)
    .single();
  if (error || !inv) return null;

  const row = inv as Record<string, unknown>;
  const customerId = typeof row.customer_id === 'string' ? row.customer_id : undefined;
  const recordBrand = getInvoiceDocumentBrand(row.company_info);

  return withSendBrand(customerId, recordBrand, {
    customerId,
    sourceRecordId: invoiceId,
    documentForm: {
      customerName: String(row.customer_name || ''),
      documentRef: String(row.invoice_number || ''),
      amount: formatInr(row.total_amount),
      dueDate: toDateOnly(row.invoice_date) || todayIsoDate(),
      message: getDefaultDocumentMessage('invoice'),
    },
    recipientEmail: typeof row.customer_email === 'string' ? row.customer_email : undefined,
    recipientPhone:
      typeof row.customer_phone === 'string' && row.customer_phone.trim()
        ? row.customer_phone.trim()
        : undefined,
  });
}

async function applyCustomerRecord(
  customerId: string,
  templateType: 'quotation' | 'general' = 'quotation'
): Promise<EmailSourceApplyResult | null> {
  const { data, error } = await db.customers.getById(customerId);
  if (error || !data) return null;

  const customer = data as Record<string, unknown>;
  const customerName = String(customer.full_name || '');
  const { sendBrand, lastServiceBrand } = await resolveSendBrand(customerId, undefined);
  const recipientEmail = getValidCustomerEmail(customer.email) ?? undefined;

  return {
    sendBrand,
    lastServiceBrand,
    customerId,
    sourceRecordId: customerId,
    documentForm: {
      documentBrand: sendBrand,
      customerName,
      documentRef: '',
      amount: '',
      dueDate: '',
      message: templateType === 'general' ? '' : getDefaultDocumentMessage(templateType),
      customSubject: templateType === 'general' ? '' : `Message from ${getDocumentBrandLabel(sendBrand)}`,
    },
    recipientEmail,
    ...getCustomerPhones(customer),
  };
}
