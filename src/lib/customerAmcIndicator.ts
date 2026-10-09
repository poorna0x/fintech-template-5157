import { toDateOnly } from '@/lib/amcAutoJobSchedule';

export type CustomerAmcIndicatorRow = {
  customer_id?: string | null;
  status?: string | null;
  end_date?: string | null;
};

export type CustomerAmcIndicatorMaps = {
  /** End date is today or later, and the contract is still the current one. */
  active: Record<string, boolean>;
  /** Latest contract end date is already past, and nothing newer is still in force. */
  expired: Record<string, boolean>;
};

/**
 * Green only while an AMC still covers today.
 * Amber when the latest end date has passed and no newer contract replaced it.
 */
export function buildCustomerAmcIndicatorMaps(
  rows: CustomerAmcIndicatorRow[] | null | undefined,
  todayYmd: string
): CustomerAmcIndicatorMaps {
  const grouped = new Map<string, CustomerAmcIndicatorRow[]>();
  for (const row of rows || []) {
    const customerId = row?.customer_id;
    if (!customerId) continue;
    const status = String(row.status || '').toUpperCase();
    if (status === 'CANCELLED') continue;
    const list = grouped.get(customerId) || [];
    list.push(row);
    grouped.set(customerId, list);
  }

  const active: Record<string, boolean> = {};
  const expired: Record<string, boolean> = {};

  for (const [customerId, list] of grouped) {
    let inForce = false;
    let latestEnd: string | null = null;
    for (const row of list) {
      const status = String(row.status || '').toUpperCase();
      const end = toDateOnly(row.end_date);
      if (end && (!latestEnd || end > latestEnd)) latestEnd = end;
      const stillCurrent =
        status !== 'EXPIRED' &&
        status !== 'RENEWED' &&
        (!end || end >= todayYmd);
      if (stillCurrent) inForce = true;
    }
    if (inForce) {
      active[customerId] = true;
      continue;
    }
    if (latestEnd && latestEnd < todayYmd) expired[customerId] = true;
  }

  return { active, expired };
}
