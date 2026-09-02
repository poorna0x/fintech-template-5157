/** technicians.account_status — null / unknown treated as ACTIVE (legacy rows). */

export type TechnicianAccountStatus = 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';

export function technicianAccountStatus(
  tech: { account_status?: unknown } | null | undefined
): TechnicianAccountStatus {
  const raw = String(tech?.account_status ?? 'ACTIVE').trim().toUpperCase();
  if (raw === 'INACTIVE' || raw === 'SUSPENDED') return raw;
  return 'ACTIVE';
}

/** Live roster, maps, assign, locations — Active only. */
export function isActiveTechnicianAccount(
  tech: { account_status?: unknown } | null | undefined
): boolean {
  return technicianAccountStatus(tech) === 'ACTIVE';
}

/** Salary / payments lists — hide Inactive, keep Suspended so history still calculates. */
export function isSalaryListedTechnician(
  tech: { account_status?: unknown } | null | undefined
): boolean {
  return technicianAccountStatus(tech) !== 'INACTIVE';
}

export function technicianAccountStatusSuffix(
  tech: { account_status?: unknown } | null | undefined
): string {
  const status = technicianAccountStatus(tech);
  if (status === 'INACTIVE') return ' (Inactive)';
  if (status === 'SUSPENDED') return ' (Suspended)';
  return '';
}
