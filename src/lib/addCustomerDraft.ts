const ADD_CUSTOMER_DRAFT_KEY = 'add_customer_draft_v1';

export type AddCustomerDraft = {
  addFormData?: {
    full_name?: string;
    phone?: string;
    alternate_phone?: string;
    email?: string;
    address?: string;
    visible_address?: string;
    notes?: string;
    google_location?: string;
    service_types?: string[];
    equipment?: { [serviceType: string]: { brand?: string; model?: string } };
    photos?: { [serviceType: string]: string[] };
    [key: string]: unknown;
  };
  step5JobData?: Record<string, unknown>;
  currentStep?: number;
  shouldCreateJob?: boolean;
};

export function loadAddCustomerDraft(): AddCustomerDraft | null {
  try {
    const raw = localStorage.getItem(ADD_CUSTOMER_DRAFT_KEY);
    return raw ? (JSON.parse(raw) as AddCustomerDraft) : null;
  } catch {
    return null;
  }
}

export function clearAddCustomerDraft(): void {
  try {
    localStorage.removeItem(ADD_CUSTOMER_DRAFT_KEY);
  } catch {
    /* ignore */
  }
}

export function saveAddCustomerDraft(payload: AddCustomerDraft): void {
  try {
    localStorage.setItem(ADD_CUSTOMER_DRAFT_KEY, JSON.stringify(payload));
  } catch {
    /* ignore */
  }
}

/**
 * Whether a saved draft holds enough typed info to be worth resuming.
 * Default RO-only (no name/phone/address) is not worth a resume prompt.
 */
export function draftHasData(draft: AddCustomerDraft | null | undefined): boolean {
  const f = draft?.addFormData;
  if (!f) return false;
  const text = (v: unknown) => String(v || '').trim();
  if (
    text(f.full_name) ||
    text(f.phone) ||
    text(f.alternate_phone) ||
    text(f.email) ||
    text(f.address) ||
    text(f.visible_address) ||
    text(f.notes) ||
    text(f.google_location)
  ) {
    return true;
  }
  const types = Array.isArray(f.service_types) ? f.service_types.filter(Boolean) : [];
  if (types.length === 0) return false;
  if (types.length === 1 && types[0] === 'RO') {
    const ro = f.equipment?.RO;
    const hasRoGear = Boolean(text(ro?.brand) || text(ro?.model));
    const hasRoPhotos = Array.isArray(f.photos?.RO) && f.photos.RO.length > 0;
    return hasRoGear || hasRoPhotos;
  }
  return true;
}

export { ADD_CUSTOMER_DRAFT_KEY };
