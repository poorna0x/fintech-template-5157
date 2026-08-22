import { extractMapsUrlFromText } from '@/lib/googleMapsLink';
import {
  createOldCompletedJob,
  formatIndiaMobile,
  OLD_JOB_TECHNICIAN_OFFICE,
  saveOldJobCustomer,
  saveOldJobModel,
  validateIndiaMobile,
  type OldJobSavedCustomer,
} from '@/lib/aiCrmOldCompletedJob';
import { parseFlexibleCompletedDate, type ParsedFlexibleDate } from '@/lib/parseFlexibleDate';

export type OldJobChatStep =
  | 'customer'
  | 'model'
  | 'date'
  | 'bill'
  | 'payment'
  | 'technician';

export type OldJobCustomerDraft = {
  fullName: string;
  phone: string;
  googleLocation: string;
  skipMaps: boolean;
};

export type OldJobTechnicianOption = {
  id: string;
  fullName: string;
};

const CANCEL_RE = /^(cancel|stop|never mind|forget it|abort)$/i;
const SKIP_RE = /^(skip|no|none|not now|no photo|later)$/i;
const OFFICE_RE = /^(office|office staff|no technician)$/i;

export function isCancelOldJobMessage(text: string): boolean {
  return CANCEL_RE.test(String(text || '').trim());
}

export function isSkipOldJobMessage(text: string): boolean {
  return SKIP_RE.test(String(text || '').trim());
}

export function oldJobPrompt(step: OldJobChatStep): string {
  switch (step) {
    case 'customer':
      return 'Send the customer name and phone number. Paste a Google Maps location if you have it, or type skip.';
    case 'model':
      return 'Now send the model name and attach a photo of the purifier.';
    case 'date':
      return 'What date was this job completed? You can type last Sep or 24 September 2025.';
    case 'bill':
      return 'Attach the bill photo. You can also type the amount if you know it.';
    case 'payment':
      return 'Attach the payment photo, or type skip.';
    case 'technician':
      return 'Who completed this job? Type the technician name, or office.';
  }
}

export function oldJobPlaceholder(step: OldJobChatStep | null): string {
  switch (step) {
    case 'customer':
      return 'Name, phone, Maps link optional…';
    case 'model':
      return 'Model name, and attach a photo…';
    case 'date':
      return 'last Sep, or 24 September 2025';
    case 'bill':
      return 'Attach bill photo, amount optional…';
    case 'payment':
      return 'Attach payment photo, or type skip';
    case 'technician':
      return 'Technician name, or office';
    default:
      return 'Ask anything about your CRM…';
  }
}

function stripLabels(text: string): string {
  return String(text || '')
    .replace(/\b(name|phone|mobile|number|location|maps?|link|model|amount|rs|inr)\s*[:\-]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function extractPhoneFromChat(text: string): string | null {
  const withoutUrl = String(text || '').replace(/https?:\/\/\S+/gi, ' ');
  const match = withoutUrl.match(/(?:\+?91[\s-]*)?[6-9]\d{4}[\s-]?\d{5}/);
  if (!match) return null;
  const check = validateIndiaMobile(formatIndiaMobile(match[0]));
  return check.ok ? check.phone : null;
}

const SKIP_MAPS_RE =
  /\b((i\s+)?(do\s*n'?t|dont)\s+have\s+(a\s+|the\s+)?(google\s+)?(maps?|location|pin)|no\s+(google\s+)?(maps?|location|pin)|skip\s+(the\s+)?(maps?|location|pin)|maps?\s+i\s+(do\s*n'?t|dont)\s+have)\b/i;

export function isSkipMapsMessage(text: string): boolean {
  const t = String(text || '').toLowerCase().replace(/['’]/g, '');
  if (!t.trim()) return false;
  if (isSkipOldJobMessage(t)) return true;
  return SKIP_MAPS_RE.test(t);
}

function stripSkipMapsPhrase(text: string): string {
  return String(text || '')
    .replace(new RegExp(SKIP_MAPS_RE.source, 'gi'), ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function parseOldJobCustomerMessage(
  text: string,
  previous: OldJobCustomerDraft
): OldJobCustomerDraft {
  const skipMaps = previous.skipMaps || isSkipMapsMessage(text);
  const maps = extractMapsUrlFromText(text) || previous.googleLocation;
  const phone = extractPhoneFromChat(text) || previous.phone;
  let leftover = stripLabels(text);
  const url = extractMapsUrlFromText(text);
  if (url) leftover = leftover.replace(url, ' ');
  leftover = leftover.replace(/(?:\+?91[\s-]*)?[6-9]\d{4}[\s-]?\d{5}/, ' ');
  leftover = leftover.replace(/https?:\/\/\S+/gi, ' ');
  leftover = stripSkipMapsPhrase(leftover);
  leftover = leftover.replace(/\s+/g, ' ').trim();
  const fullName = leftover.length >= 2 ? leftover : previous.fullName;
  return {
    fullName,
    phone,
    googleLocation: maps || previous.googleLocation,
    skipMaps: skipMaps && !maps,
  };
}

export function missingOldJobCustomerFields(draft: OldJobCustomerDraft): string[] {
  const missing: string[] = [];
  if (!draft.fullName.trim() || draft.fullName.trim().length < 2) missing.push('name');
  if (!draft.phone) missing.push('phone');
  if (!draft.googleLocation && !draft.skipMaps) missing.push('Google Maps location');
  return missing;
}

export function askForMissingCustomerFields(missing: string[]): string {
  if (missing.length === 3) return oldJobPrompt('customer');
  if (missing.length === 1 && missing[0] === 'Google Maps location') {
    return 'Still need the Google Maps location, or type skip if you don’t have it.';
  }
  if (missing.length === 1) return `Still need the ${missing[0]}.`;
  return `Still need the ${missing.slice(0, -1).join(', ')} and ${missing[missing.length - 1]}.`;
}

export function parseBillAmount(text: string): number | null {
  const cleaned = String(text || '').replace(/,/g, '').trim();
  if (!cleaned) return null;
  const match = cleaned.match(/(?:₹|rs\.?|inr)?\s*(\d+(?:\.\d{1,2})?)/i);
  if (!match) return null;
  const amount = Number(match[1]);
  if (!Number.isFinite(amount) || amount < 0 || amount > 1_000_000) return null;
  // Ignore values that look like years.
  if (amount >= 2000 && amount <= 2100 && !/(₹|rs|inr)/i.test(cleaned)) return null;
  return amount;
}

export function parseOldJobDateMessage(
  text: string,
  pendingMonthIso: string | null
): { ok: true; date: ParsedFlexibleDate } | { ok: false; error: string } {
  const trimmed = String(text || '').trim();
  if (!trimmed) return { ok: false, error: 'Send the completed date, like last Sep or 24 September 2025.' };

  if (pendingMonthIso && /^(ok|okay|yes|continue)$/i.test(trimmed)) {
    const parsed = parseFlexibleCompletedDate(pendingMonthIso);
    if (parsed) return { ok: true, date: { ...parsed, guessedDay: false } };
  }

  const dayOnly = trimmed.match(/^(\d{1,2})(?:st|nd|rd|th)?$/i);
  if (dayOnly && pendingMonthIso) {
    const [year, month] = pendingMonthIso.split('-').map(Number);
    const day = Number(dayOnly[1]);
    const parsed = parseFlexibleCompletedDate(`${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`);
    if (!parsed) return { ok: false, error: 'That day is not valid for that month. Send it like 24 Sep 2025.' };
    return { ok: true, date: { ...parsed, guessedDay: false } };
  }

  const parsed = parseFlexibleCompletedDate(trimmed);
  if (!parsed) return { ok: false, error: 'Could not read that date. Try last Sep or 24 September 2025.' };
  return { ok: true, date: parsed };
}

function normalizeName(value: string): string {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function matchOldJobTechnician(
  text: string,
  technicians: OldJobTechnicianOption[]
):
  | { type: 'office' }
  | { type: 'one'; technician: OldJobTechnicianOption }
  | { type: 'many'; technicians: OldJobTechnicianOption[] }
  | { type: 'none' } {
  const query = normalizeName(text);
  if (!query) return { type: 'none' };
  if (OFFICE_RE.test(text.trim())) return { type: 'office' };

  const exact = technicians.filter((tech) => normalizeName(tech.fullName) === query);
  if (exact.length === 1) return { type: 'one', technician: exact[0] };

  const partial = technicians.filter((tech) => {
    const name = normalizeName(tech.fullName);
    return name.includes(query) || query.includes(name) || name.split(' ')[0] === query;
  });
  if (partial.length === 1) return { type: 'one', technician: partial[0] };
  if (partial.length > 1) return { type: 'many', technicians: partial.slice(0, 6) };
  return { type: 'none' };
}

export function emptyOldJobCustomerDraft(): OldJobCustomerDraft {
  return { fullName: '', phone: '', googleLocation: '', skipMaps: false };
}

export type OldJobFlowState = {
  step: OldJobChatStep;
  customerDraft: OldJobCustomerDraft;
  customer: OldJobSavedCustomer | null;
  model: string;
  modelPhotos: string[];
  completedDate: string | null;
  pendingMonthIso: string | null;
  billPhotos: string[];
  billAmount: number | null;
  paymentPhoto: string | null;
};

export type OldJobChatAdvance = {
  flow: OldJobFlowState | null;
  assistantText: string;
  finished?: {
    customerId: string;
    customerName: string;
    jobId: string;
    jobNumber: string;
    dateLabel: string;
  };
};

export function createOldJobFlow(): OldJobFlowState {
  return {
    step: 'customer',
    customerDraft: emptyOldJobCustomerDraft(),
    customer: null,
    model: '',
    modelPhotos: [],
    completedDate: null,
    pendingMonthIso: null,
    billPhotos: [],
    billAmount: null,
    paymentPhoto: null,
  };
}

export async function advanceOldJobChat(opts: {
  flow: OldJobFlowState;
  message: string;
  photoUrls: string[];
  technicians: OldJobTechnicianOption[];
}): Promise<OldJobChatAdvance> {
  const message = String(opts.message || '').trim();
  const photos = opts.photoUrls.filter(Boolean);
  const flow: OldJobFlowState = {
    ...opts.flow,
    customerDraft: { ...opts.flow.customerDraft },
    modelPhotos: [...opts.flow.modelPhotos],
    billPhotos: [...opts.flow.billPhotos],
  };

  if (isCancelOldJobMessage(message)) {
    return { flow: null, assistantText: 'Stopped. Type create old completed job if you want to start again.' };
  }

  if (flow.step === 'customer') {
    flow.customerDraft = parseOldJobCustomerMessage(message, flow.customerDraft);
    const missing = missingOldJobCustomerFields(flow.customerDraft);
    if (missing.length) {
      return { flow, assistantText: askForMissingCustomerFields(missing) };
    }
    const saved = await saveOldJobCustomer(flow.customerDraft);
    if (!saved.ok) return { flow, assistantText: saved.error };
    flow.customer = saved.customer;
    flow.step = 'model';
    const who = saved.customer.existing
      ? `Using existing customer ${saved.customer.fullName}.`
      : `Saved ${saved.customer.fullName}.`;
    return { flow, assistantText: `${who} ${oldJobPrompt('model')}` };
  }

  if (flow.step === 'model') {
    if (message) flow.model = message;
    if (photos.length) flow.modelPhotos = [...flow.modelPhotos, ...photos];
    if (!flow.model.trim()) {
      return { flow, assistantText: 'Send the model name too.' };
    }
    if (!flow.modelPhotos.length) {
      return { flow, assistantText: 'Attach a photo of the purifier too.' };
    }
    if (!flow.customer) {
      return { flow, assistantText: oldJobPrompt('customer') };
    }
    const saved = await saveOldJobModel({
      customerId: flow.customer.id,
      model: flow.model,
      photoUrls: flow.modelPhotos,
    });
    if (!saved.ok) return { flow, assistantText: saved.error };
    flow.step = 'date';
    return { flow, assistantText: oldJobPrompt('date') };
  }

  if (flow.step === 'date') {
    const parsed = parseOldJobDateMessage(message, flow.pendingMonthIso);
    if (!parsed.ok) return { flow, assistantText: parsed.error };
    if (parsed.date.guessedDay) {
      flow.pendingMonthIso = parsed.date.iso;
      flow.completedDate = parsed.date.iso;
      return {
        flow,
        assistantText: `Using ${parsed.date.label}. Send the day if that’s wrong (like 24), or type ok.`,
      };
    }
    flow.completedDate = parsed.date.iso;
    flow.pendingMonthIso = null;
    flow.step = 'bill';
    return { flow, assistantText: `Completed date is ${parsed.date.label}. ${oldJobPrompt('bill')}` };
  }

  if (flow.step === 'bill') {
    if (photos.length) flow.billPhotos = [...flow.billPhotos, ...photos];
    const amount = parseBillAmount(message);
    if (amount != null) flow.billAmount = amount;
    if (!flow.billPhotos.length) {
      return { flow, assistantText: 'Attach the bill photo.' };
    }
    flow.step = 'payment';
    return { flow, assistantText: oldJobPrompt('payment') };
  }

  if (flow.step === 'payment') {
    if (isSkipOldJobMessage(message) || /^skip\b/i.test(message)) {
      flow.paymentPhoto = null;
      flow.step = 'technician';
      return { flow, assistantText: oldJobPrompt('technician') };
    }
    if (photos.length) {
      flow.paymentPhoto = photos[0];
      flow.step = 'technician';
      return { flow, assistantText: oldJobPrompt('technician') };
    }
    return { flow, assistantText: 'Attach the payment photo, or type skip.' };
  }

  const match = matchOldJobTechnician(message, opts.technicians);
  if (match.type === 'none') {
    const names = opts.technicians.slice(0, 8).map((tech) => tech.fullName).join(', ');
    return {
      flow,
      assistantText: names
        ? `I could not match that technician. Try one of: ${names}. Or type office.`
        : 'Type the technician name, or office.',
    };
  }
  if (match.type === 'many') {
    return {
      flow,
      assistantText: `Which one? ${match.technicians.map((tech) => tech.fullName).join(', ')}`,
    };
  }
  if (!flow.customer || !flow.completedDate || !flow.billPhotos.length) {
    return { flow, assistantText: 'Something is missing. Type cancel and start again.' };
  }

  const created = await createOldCompletedJob({
    customerId: flow.customer.id,
    completedDateIso: flow.completedDate,
    technicianId: match.type === 'office' ? OLD_JOB_TECHNICIAN_OFFICE : match.technician.id,
    billPhotoUrls: flow.billPhotos,
    paymentPhotoUrl: flow.paymentPhoto,
    billAmount: flow.billAmount,
  });
  if (!created.ok) return { flow, assistantText: created.error };

  const techLabel = match.type === 'office' ? 'Office' : match.technician.fullName;
  return {
    flow: null,
    assistantText: `Done. ${created.jobNumber} for ${flow.customer.fullName} is completed on ${created.dateLabel}, by ${techLabel}.`,
    finished: {
      customerId: flow.customer.id,
      customerName: flow.customer.fullName,
      jobId: created.jobId,
      jobNumber: created.jobNumber,
      dateLabel: created.dateLabel,
    },
  };
}

