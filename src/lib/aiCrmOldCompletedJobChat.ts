import { extractMapsUrlFromText } from '@/lib/googleMapsLink';
import {
  createOldCompletedJob,
  formatIndiaMobile,
  lookupOldJobCustomerByPhone,
  OLD_JOB_TECHNICIAN_OFFICE,
  saveOldJobCustomer,
  saveOldJobModel,
  titleCaseName,
  validateIndiaMobile,
  type OldJobSavedCustomer,
} from '@/lib/aiCrmOldCompletedJob';
import { parseFlexibleCompletedDate, type ParsedFlexibleDate } from '@/lib/parseFlexibleDate';

export type OldJobChatStep =
  | 'phone'
  | 'name'
  | 'maps'
  | 'brand'
  | 'purifier_photo'
  | 'date'
  | 'bill_amount'
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
const SKIP_RE =
  /^(skip|no|none|not now|later)(\s+(it|this|that|photo|photos|picture|name|brand|model|maps?|location|pin|step))?$/i;
const SKIP_PHRASE_RE =
  /\b((i\s+)?(do\s*n'?t|dont)\s+have\s+(a\s+|the\s+)?(photo|picture|image|brand|model)|no\s+(photo|picture|image|brand|model))\b/i;
const OFFICE_RE = /^(office|office staff|no technician)$/i;

export function isCancelOldJobMessage(text: string): boolean {
  return CANCEL_RE.test(String(text || '').trim());
}

export function isSkipOldJobMessage(text: string): boolean {
  const t = String(text || '')
    .trim()
    .toLowerCase()
    .replace(/['’]/g, '');
  if (!t) return false;
  if (SKIP_RE.test(t) || /^skip\b/.test(t)) return true;
  return SKIP_PHRASE_RE.test(t);
}

export function oldJobPrompt(step: OldJobChatStep): string {
  switch (step) {
    case 'phone':
      return 'Send the customer phone number.';
    case 'name':
      return 'No customer with that number. Send the name.';
    case 'maps':
      return 'Paste a Google Maps location, or type skip.';
    case 'brand':
      return 'Send the brand or model name, or type skip.';
    case 'purifier_photo':
      return 'Attach a photo of the purifier, or type skip.';
    case 'date':
      return 'What date was this job completed? You can type yesterday, last Sep, or 24 September 2025.';
    case 'bill_amount':
      return 'What was the bill amount? Type the rupees, like 1500.';
    case 'bill':
      return 'Attach the bill photo, or type skip.';
    case 'payment':
      return 'Attach the payment photo, or type skip.';
    case 'technician':
      return 'Who completed this job? Type the technician name, office, or skip.';
  }
}

export function oldJobPlaceholder(step: OldJobChatStep | null): string {
  switch (step) {
    case 'phone':
      return '10-digit phone number…';
    case 'name':
      return 'Customer name…';
    case 'maps':
      return 'Maps link, or skip';
    case 'brand':
      return 'Brand or model, or skip';
    case 'purifier_photo':
      return 'Purifier photo, or skip';
    case 'date':
      return 'yesterday, last Sep, or 24 Sep 2025';
    case 'bill_amount':
      return 'Bill amount, like 1500';
    case 'bill':
      return 'Bill photo, or skip';
    case 'payment':
      return 'Payment photo, or skip';
    case 'technician':
      return 'Technician name, office, or skip';
    default:
      return 'Ask anything about your CRM…';
  }
}

function stripLabels(text: string): string {
  return String(text || '')
    .replace(/\b(name|phone|mobile|number|location|maps?|link|brand|model|amount|rs|inr)\s*[:\-]/gi, ' ')
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
  const fullName = leftover.length >= 2 ? titleCaseName(leftover) : previous.fullName;
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
  if (missing.length === 3) return oldJobPrompt('phone');
  if (missing.length === 1 && missing[0] === 'Google Maps location') {
    return 'Still need the Google Maps location, or type skip if you don’t have it.';
  }
  if (missing.length === 1) return `Still need the ${missing[0]}.`;
  return `Still need the ${missing.slice(0, -1).join(', ')} and ${missing[missing.length - 1]}.`;
}

export function parseBillAmount(text: string, opts?: { allowYearLike?: boolean }): number | null {
  const cleaned = String(text || '').replace(/,/g, '').trim();
  if (!cleaned) return null;
  const match = cleaned.match(/(?:₹|rs\.?|inr)?\s*(\d+(?:\.\d{1,2})?)/i);
  if (!match) return null;
  const amount = Number(match[1]);
  if (!Number.isFinite(amount) || amount < 0 || amount > 1_000_000) return null;
  if (
    !opts?.allowYearLike &&
    amount >= 2000 &&
    amount <= 2100 &&
    !/(₹|rs|inr)/i.test(cleaned)
  ) {
    return null;
  }
  return amount;
}

function formatRupees(amount: number): string {
  return `₹${amount.toLocaleString('en-IN')}`;
}

export function parseOldJobDateMessage(
  text: string,
  pendingMonthIso: string | null
): { ok: true; date: ParsedFlexibleDate } | { ok: false; error: string } {
  const trimmed = String(text || '').trim();
  if (!trimmed) return { ok: false, error: 'Send the completed date, like yesterday, last Sep, or 24 September 2025.' };

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
  if (!parsed) return { ok: false, error: 'Could not read that date. Try yesterday, last Sep, or 24 September 2025.' };
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

function describeCustomer(customer: OldJobSavedCustomer): string {
  const code = customer.customerCode ? ` (${customer.customerCode})` : '';
  return `${customer.fullName}${code} · ${customer.phone}`;
}

export function parseEquipmentLabel(text: string): { brand: string; model: string } {
  const cleaned = String(text || '')
    .replace(/\b(brand|model|name)\s*[:\-]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return { brand: '', model: '' };
  const parts = cleaned.split(' ');
  if (parts.length === 1) {
    const one = titleCaseName(parts[0]);
    return { brand: one, model: one };
  }
  return {
    brand: titleCaseName(parts[0]),
    model: titleCaseName(parts.slice(1).join(' ')),
  };
}

export function leftoverNameFromMessage(text: string): string {
  let leftover = stripLabels(text);
  const url = extractMapsUrlFromText(text);
  if (url) leftover = leftover.replace(url, ' ');
  leftover = leftover.replace(/(?:\+?91[\s-]*)?[6-9]\d{4}[\s-]?\d{5}/, ' ');
  leftover = leftover.replace(/https?:\/\/\S+/gi, ' ');
  leftover = stripSkipMapsPhrase(leftover);
  leftover = leftover.replace(/\s+/g, ' ').trim();
  return leftover.length >= 2 ? titleCaseName(leftover) : '';
}

export type OldJobFlowState = {
  step: OldJobChatStep;
  customerDraft: OldJobCustomerDraft;
  customer: OldJobSavedCustomer | null;
  brand: string;
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

function equipmentLabel(flow: OldJobFlowState): string {
  if (flow.brand && flow.model && flow.model !== flow.brand) {
    return `${flow.brand} ${flow.model}`;
  }
  return flow.brand || flow.model;
}

export function createOldJobFlow(): OldJobFlowState {
  return {
    step: 'phone',
    customerDraft: emptyOldJobCustomerDraft(),
    customer: null,
    brand: '',
    model: '',
    modelPhotos: [],
    completedDate: null,
    pendingMonthIso: null,
    billPhotos: [],
    billAmount: null,
    paymentPhoto: null,
  };
}

async function saveEquipmentThenDate(flow: OldJobFlowState): Promise<OldJobChatAdvance> {
  if (!flow.customer) {
    return { flow, assistantText: oldJobPrompt('phone') };
  }
  const hasAnything = Boolean(flow.brand.trim() || flow.model.trim() || flow.modelPhotos.length);
  if (hasAnything) {
    const saved = await saveOldJobModel({
      customerId: flow.customer.id,
      brand: flow.brand,
      model: flow.model,
      photoUrls: flow.modelPhotos,
    });
    if (!saved.ok) return { flow, assistantText: saved.error };
  }
  flow.step = 'date';
  return { flow, assistantText: oldJobPrompt('date') };
}

async function saveNewCustomerAndContinue(flow: OldJobFlowState): Promise<OldJobChatAdvance> {
  const saved = await saveOldJobCustomer(flow.customerDraft);
  if (!saved.ok) return { flow, assistantText: saved.error };
  flow.customer = saved.customer;
  flow.step = 'brand';
  return {
    flow,
    assistantText: `Saved ${saved.customer.fullName}. ${oldJobPrompt('brand')}`,
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
  const skipped = isSkipOldJobMessage(message) || /^skip\b/i.test(message) || isSkipMapsMessage(message);
  const flow: OldJobFlowState = {
    ...opts.flow,
    customerDraft: { ...opts.flow.customerDraft },
    modelPhotos: [...opts.flow.modelPhotos],
    billPhotos: [...opts.flow.billPhotos],
  };

  if (isCancelOldJobMessage(message)) {
    return { flow: null, assistantText: 'Stopped. Type create old completed job if you want to start again.' };
  }

  if ((flow.step as string) === 'model') {
    flow.step = flow.brand || flow.model ? 'purifier_photo' : 'brand';
  }
  if (flow.step === 'bill' && flow.billAmount == null) {
    flow.step = 'bill_amount';
  }

  if (flow.step === 'phone') {
    if (skipped) return { flow, assistantText: 'Need the phone number to find or add the customer.' };
    const phone = extractPhoneFromChat(message);
    if (!phone) return { flow, assistantText: 'Send a 10-digit phone number.' };
    flow.customerDraft.phone = phone;
    const found = await lookupOldJobCustomerByPhone(phone);
    if (!found.ok) return { flow, assistantText: found.error };
    if (found.customer) {
      flow.customer = found.customer;
      flow.customerDraft.fullName = found.customer.fullName;
      flow.customerDraft.skipMaps = true;
      flow.step = 'brand';
      return {
        flow,
        assistantText: `Found ${describeCustomer(found.customer)}. ${oldJobPrompt('brand')}`,
      };
    }
    const maybeName = leftoverNameFromMessage(message);
    if (maybeName) {
      flow.customerDraft.fullName = maybeName;
      flow.step = 'maps';
      return {
        flow,
        assistantText: `New customer ${maybeName}. ${oldJobPrompt('maps')}`,
      };
    }
    flow.step = 'name';
    return { flow, assistantText: oldJobPrompt('name') };
  }

  if (flow.step === 'name') {
    if (skipped) return { flow, assistantText: 'Need the name for a new customer.' };
    const name = leftoverNameFromMessage(message) || titleCaseName(message);
    if (name.length < 2) return { flow, assistantText: 'Send the customer name.' };
    flow.customerDraft.fullName = name;
    flow.step = 'maps';
    return { flow, assistantText: `Name saved as ${name}. ${oldJobPrompt('maps')}` };
  }

  if (flow.step === 'maps') {
    if (skipped) {
      flow.customerDraft.skipMaps = true;
      return saveNewCustomerAndContinue(flow);
    }
    flow.customerDraft = parseOldJobCustomerMessage(message, flow.customerDraft);
    if (!flow.customerDraft.googleLocation) {
      return { flow, assistantText: oldJobPrompt('maps') };
    }
    return saveNewCustomerAndContinue(flow);
  }

  if (flow.step === 'brand') {
    if (photos.length) flow.modelPhotos = [...flow.modelPhotos, ...photos];
    if (skipped) {
      if (flow.modelPhotos.length) return saveEquipmentThenDate(flow);
      flow.step = 'purifier_photo';
      return { flow, assistantText: oldJobPrompt('purifier_photo') };
    }
    const label = parseEquipmentLabel(message);
    if (label.brand) {
      flow.brand = label.brand;
      flow.model = label.model;
    }
    if ((flow.brand || flow.model) && flow.modelPhotos.length) {
      return saveEquipmentThenDate(flow);
    }
    if (flow.brand || flow.model) {
      flow.step = 'purifier_photo';
      return {
        flow,
        assistantText: `Got ${equipmentLabel(flow)}. ${oldJobPrompt('purifier_photo')}`,
      };
    }
    if (flow.modelPhotos.length) {
      return { flow, assistantText: `Got the photo. ${oldJobPrompt('brand')}` };
    }
    return { flow, assistantText: oldJobPrompt('brand') };
  }

  if (flow.step === 'purifier_photo') {
    if (photos.length) flow.modelPhotos = [...flow.modelPhotos, ...photos];
    if (skipped) return saveEquipmentThenDate(flow);
    if (message) {
      const label = parseEquipmentLabel(message);
      if (label.brand) {
        flow.brand = label.brand;
        flow.model = label.model;
      }
    }
    if (!flow.modelPhotos.length) {
      return { flow, assistantText: oldJobPrompt('purifier_photo') };
    }
    return saveEquipmentThenDate(flow);
  }

  if (flow.step === 'date') {
    if (skipped && flow.completedDate) {
      flow.pendingMonthIso = null;
      flow.step = 'bill_amount';
      return { flow, assistantText: oldJobPrompt('bill_amount') };
    }
    if (skipped) return { flow, assistantText: 'Need the completed date to save this job.' };
    const parsed = parseOldJobDateMessage(message, flow.pendingMonthIso);
    if (!parsed.ok) return { flow, assistantText: parsed.error };
    if (parsed.date.guessedDay) {
      flow.pendingMonthIso = parsed.date.iso;
      flow.completedDate = parsed.date.iso;
      return {
        flow,
        assistantText: `Using ${parsed.date.label}. Send the day if that’s wrong (like 24), type ok, or skip.`,
      };
    }
    flow.completedDate = parsed.date.iso;
    flow.pendingMonthIso = null;
    flow.step = 'bill_amount';
    return { flow, assistantText: `Completed date is ${parsed.date.label}. ${oldJobPrompt('bill_amount')}` };
  }

  if (flow.step === 'bill_amount') {
    if (photos.length) flow.billPhotos = [...flow.billPhotos, ...photos];
    if (skipped) {
      return { flow, assistantText: 'Need the bill amount to save this job.' };
    }
    const amount = parseBillAmount(message, { allowYearLike: true });
    if (amount == null) {
      return { flow, assistantText: 'Send the bill amount in rupees, like 1500.' };
    }
    flow.billAmount = amount;
    if (flow.billPhotos.length) {
      flow.step = 'payment';
      return {
        flow,
        assistantText: `Bill amount is ${formatRupees(amount)}. ${oldJobPrompt('payment')}`,
      };
    }
    flow.step = 'bill';
    return {
      flow,
      assistantText: `Bill amount is ${formatRupees(amount)}. ${oldJobPrompt('bill')}`,
    };
  }

  if (flow.step === 'bill') {
    if (skipped) {
      flow.step = 'payment';
      return { flow, assistantText: oldJobPrompt('payment') };
    }
    if (photos.length) flow.billPhotos = [...flow.billPhotos, ...photos];
    const amount = parseBillAmount(message, { allowYearLike: true });
    if (amount != null) flow.billAmount = amount;
    if (flow.billAmount == null) {
      flow.step = 'bill_amount';
      return { flow, assistantText: oldJobPrompt('bill_amount') };
    }
    if (!flow.billPhotos.length) {
      return { flow, assistantText: oldJobPrompt('bill') };
    }
    flow.step = 'payment';
    return { flow, assistantText: oldJobPrompt('payment') };
  }

  if (flow.step === 'payment') {
    if (skipped) {
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

  const match = skipped
    ? ({ type: 'office' } as const)
    : matchOldJobTechnician(message, opts.technicians);
  if (match.type === 'none') {
    const names = opts.technicians.slice(0, 8).map((tech) => tech.fullName).join(', ');
    return {
      flow,
      assistantText: names
        ? `I could not match that technician. Try one of: ${names}. Or type office or skip.`
        : 'Type the technician name, office, or skip.',
    };
  }
  if (match.type === 'many') {
    return {
      flow,
      assistantText: `Which one? ${match.technicians.map((tech) => tech.fullName).join(', ')}`,
    };
  }
  if (!flow.customer || !flow.completedDate || flow.billAmount == null) {
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

