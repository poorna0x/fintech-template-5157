import { formatAddressForDisplay, removePlusCode } from '@/lib/maps';

export interface NormalizedCustomerAddress {
  street: string;
  area: string;
  city: string;
  state: string;
  pincode: string;
  landmark?: string;
  visible_address?: string;
}

function cleanAddressPart(value: string): string {
  return removePlusCode(value.trim()).replace(/\s+/g, ' ').trim();
}

function normalizeForCompare(value: string): string {
  return value.toLowerCase().replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

function cityAppearsInLine(city: string, line: string): boolean {
  const trimmed = city.trim();
  if (!trimmed) return true;
  const normLine = normalizeForCompare(line);
  const normCity = normalizeForCompare(trimmed);
  if (normLine.includes(normCity)) return true;
  if (normCity.includes('bangalore') || normCity.includes('bengaluru')) {
    return normLine.includes('bangalore') || normLine.includes('bengaluru');
  }
  return false;
}

function pincodeAppearsInLine(pincode: string, line: string): boolean {
  const trimmed = pincode.trim();
  if (!trimmed) return true;
  return line.includes(trimmed);
}

function stateAppearsInLine(state: string, line: string): boolean {
  const trimmed = state.trim();
  if (!trimmed) return true;
  return normalizeForCompare(line).includes(normalizeForCompare(trimmed));
}

/** Street field often holds the full Google formatted address from booking/add-customer. */
function looksLikeFullFormattedAddress(line: string): boolean {
  if (!line.trim()) return false;
  if (/\b\d{6}\b/.test(line)) return true;
  const segments = line.split(',').map((s) => s.trim()).filter(Boolean);
  return segments.length >= 4;
}

export function normalizeCustomerAddress(
  raw: unknown,
  extras?: { visible_address?: unknown; formattedAddress?: unknown }
): NormalizedCustomerAddress {
  const empty: NormalizedCustomerAddress = {
    street: '',
    area: '',
    city: '',
    state: '',
    pincode: '',
  };

  const visibleAddress =
    typeof extras?.visible_address === 'string' ? extras.visible_address.trim() : undefined;

  let result: NormalizedCustomerAddress;

  if (!raw) {
    const formatted =
      typeof extras?.formattedAddress === 'string' ? extras.formattedAddress.trim() : '';
    if (formatted) {
      result = { ...empty, street: formatted, visible_address: visibleAddress };
    } else {
      result = visibleAddress ? { ...empty, visible_address: visibleAddress } : empty;
    }
  } else if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) {
      result = visibleAddress ? { ...empty, visible_address: visibleAddress } : empty;
    } else {
      result = { ...empty, street: trimmed, visible_address: visibleAddress };
    }
  } else if (typeof raw === 'object') {
    const a = raw as Record<string, unknown>;
    const houseNumber = typeof a.houseNumber === 'string' ? a.houseNumber.trim() : '';
    const streetField = typeof a.street === 'string' ? a.street.trim() : '';
    const fullAddress = typeof a.fullAddress === 'string' ? a.fullAddress.trim() : '';
    const street = [houseNumber, streetField].filter(Boolean).join(' ').trim() || fullAddress;

    result = {
      street,
      area: typeof a.area === 'string' ? a.area.trim() : '',
      city: typeof a.city === 'string' ? a.city.trim() : '',
      state: typeof a.state === 'string' ? a.state.trim() : '',
      pincode:
        typeof a.pincode === 'string'
          ? a.pincode.trim()
          : a.pincode != null
            ? String(a.pincode).trim()
            : '',
      landmark: typeof a.landmark === 'string' ? a.landmark.trim() : undefined,
      visible_address:
        typeof a.visible_address === 'string'
          ? a.visible_address.trim()
          : visibleAddress,
    };
  } else {
    result = visibleAddress ? { ...empty, visible_address: visibleAddress } : empty;
  }

  return {
    ...result,
    street: cleanAddressPart(result.street),
    area: cleanAddressPart(result.area),
  };
}

/** True when we have a real postal address for documents (not just a map label). */
export function hasDocumentCustomerAddress(
  address: NormalizedCustomerAddress | undefined,
  formattedAddress?: string
): boolean {
  if (address?.street || address?.area || address?.city || address?.state || address?.pincode) {
    return true;
  }
  return Boolean(formattedAddress?.trim());
}

export function formatCustomerStreetLine(address: NormalizedCustomerAddress): string {
  const parts = [address.street, address.area].filter(Boolean);
  return parts.join(', ').replace(/,\s*$/, '').trim();
}

/** One address line for PDFs and previews — uses stored street when it is already complete. */
export function formatCustomerFullAddressLine(address: NormalizedCustomerAddress): string {
  const cleaned: NormalizedCustomerAddress = {
    street: cleanAddressPart(address.street),
    area: cleanAddressPart(address.area),
    city: address.city.trim(),
    state: address.state.trim(),
    pincode: address.pincode.trim(),
  };

  let line = formatCustomerStreetLine(cleaned);
  if (!line) {
    line = cleanAddressPart(formatAddressForDisplay(cleaned));
  }

  // Street often holds the full Google/geocoded line — use it as-is (plus code already stripped).
  if (looksLikeFullFormattedAddress(line)) {
    return line;
  }

  const extras: string[] = [];
  if (cleaned.city && !cityAppearsInLine(cleaned.city, line)) {
    extras.push(cleaned.city);
  }
  if (cleaned.state && !stateAppearsInLine(cleaned.state, line)) {
    extras.push(cleaned.state);
  }
  if (cleaned.pincode && !pincodeAppearsInLine(cleaned.pincode, line)) {
    extras.push(cleaned.pincode);
  }

  if (extras.length) {
    line = [line, extras.join(', ')].filter(Boolean).join(', ');
  }

  return line.trim();
}

/** @deprecated Use formatCustomerFullAddressLine — kept for call sites that expect this name. */
export function formatCustomerAddressForPdf(address: NormalizedCustomerAddress): string {
  return formatCustomerFullAddressLine(address);
}

/** Bill/PDF fields: full line in address; omit city/pincode when already included. */
export function formatCustomerAddressForBill(address: NormalizedCustomerAddress): {
  address: string;
  city: string;
  state: string;
  pincode: string;
} {
  const normalized = normalizeCustomerAddress(address);
  const fullLine = formatCustomerFullAddressLine(normalized);

  if (looksLikeFullFormattedAddress(fullLine) || cityAppearsInLine(normalized.city, fullLine)) {
    return { address: fullLine, city: '', state: '', pincode: '' };
  }

  const city = normalized.city && !cityAppearsInLine(normalized.city, fullLine) ? normalized.city : '';
  const state = normalized.state && !stateAppearsInLine(normalized.state, fullLine) ? normalized.state : '';
  const pincode =
    normalized.pincode && !pincodeAppearsInLine(normalized.pincode, fullLine) ? normalized.pincode : '';

  return { address: fullLine, city, state, pincode };
}

/** Never return `[object Object]` — empty or missing address becomes `''`. */
export function stringifyCustomerAddressForTemplate(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string') {
    const t = value.trim();
    if (!t || t === '[object Object]') return '';
    return t;
  }
  if (typeof value === 'object') {
    return formatCustomerFullAddressLine(normalizeCustomerAddress(value)).trim();
  }
  return '';
}

/** Flatten a Bill/PDF customer so address/city/state/pincode are strings. */
export function formatPdfCustomerAddress(customer: {
  address?: unknown;
  city?: string;
  state?: string;
  pincode?: string;
}): { address: string; city: string; state: string; pincode: string } {
  const fromAddr = normalizeCustomerAddress(customer.address);
  return formatCustomerAddressForBill({
    ...fromAddr,
    city: fromAddr.city || String(customer.city || '').trim(),
    state: fromAddr.state || String(customer.state || '').trim(),
    pincode: fromAddr.pincode || String(customer.pincode || '').trim(),
  });
}

/** Name to print on PDFs. Empty when missing — never the dummy "Customer Name" label. */
export function pdfCustomerDisplayName(
  customer: { fullName?: string | null; name?: string | null } | null | undefined
): string {
  const name = String(customer?.fullName || customer?.name || '').trim();
  if (!name || /^customer\s*name$/i.test(name)) return '';
  return name;
}

/** City / state / pincode as one line; skip any part that is not present. */
export function formatPdfLocalityLine(addr: {
  city?: string | null;
  state?: string | null;
  pincode?: string | null;
}): string {
  const city = String(addr.city || '').trim();
  const state = String(addr.state || '').trim();
  const pin = String(addr.pincode || '').trim();
  const locality = [city, state].filter(Boolean).join(', ');
  if (locality && pin) return `${locality} - ${pin}`;
  return locality || pin;
}
