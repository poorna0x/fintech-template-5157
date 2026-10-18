const DOOR_KEY = 'hro_book_door';

/** Call this when a person taps Book on the website, before opening /book. */
export function markWebsiteBookDoor(): void {
  try {
    sessionStorage.setItem(DOOR_KEY, 'site');
  } catch {
    /* private mode */
  }
}

/**
 * Public /book submit. A site tap set the door note. A QR sticker opens /book
 * with no note, so the address bar stays the same for both.
 */
export function publicBookingVia(): 'website' | 'qr' {
  try {
    if (sessionStorage.getItem(DOOR_KEY) === 'site') return 'website';
  } catch {
    /* ignore */
  }
  return 'qr';
}

function requirementRows(requirements: unknown): Array<Record<string, unknown>> {
  let value = requirements;
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value);
    } catch {
      return [];
    }
  }
  if (Array.isArray(value)) {
    return value.filter((row) => row && typeof row === 'object') as Array<Record<string, unknown>>;
  }
  if (value && typeof value === 'object') return [value as Record<string, unknown>];
  return [];
}

/** True only when this public booking was opened straight from the sticker link. */
export function jobBookedViaQr(requirements: unknown): boolean {
  return requirementRows(requirements).some(
    (row) => String(row.booking_via || '').trim().toLowerCase() === 'qr'
  );
}
