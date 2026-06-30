/** Shared AMC agreement number format: AMC-{YEAR}-{suffix} */

export function suggestAmcAgreementNumber(options?: { jobNumber?: string | null }): string {
  const year = new Date().getFullYear();

  const jobNumber = options?.jobNumber?.trim();
  if (jobNumber) {
    const slug = jobNumber
      .replace(/\s+/g, '-')
      .replace(/[^a-zA-Z0-9-]/g, '')
      .toUpperCase()
      .slice(0, 48);
    if (slug) {
      return `AMC-${year}-${slug}`;
    }
  }

  return `AMC-${year}-${String(Math.floor(Math.random() * 1000)).padStart(3, '0')}`;
}

export function parseAmcAgreementNumberFromAdditionalInfo(
  additionalInfo: unknown
): string | null {
  if (additionalInfo == null) return null;
  try {
    const meta =
      typeof additionalInfo === 'string' ? JSON.parse(additionalInfo) : additionalInfo;
    const num = (meta as { agreement_number?: unknown })?.agreement_number;
    return typeof num === 'string' && num.trim() ? num.trim() : null;
  } catch {
    return null;
  }
}

export function normalizeAmcAgreementNumber(value: string): string {
  return value.trim().toLowerCase();
}

export function amcAgreementNumbersMatch(a: string, b: string): boolean {
  return normalizeAmcAgreementNumber(a) === normalizeAmcAgreementNumber(b);
}

/** Calendar day in Asia/Kolkata for AMC "created today" upsert. */
export function amcCreatedOnIstDay(createdAt: string, dayIst?: string): boolean {
  const targetDay =
    dayIst ?? new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  const rowDay = new Date(createdAt).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  return rowDay === targetDay;
}
