import type { Customer } from '@/types';

/** Stored on `customers.customer_tier` */
export type CustomerTierValue = 'PREMIUM' | 'WORST';

export function normalizeCustomerTier(v: unknown): CustomerTierValue | null {
  if (v === 'PREMIUM' || v === 'premium') return 'PREMIUM';
  if (v === 'WORST' || v === 'worst' || v === 'BAD') return 'WORST';
  return null;
}

/** Tailwind classes for customer name (gold premium / red worst). */
export function customerNameClassName(customer: Customer | Record<string, unknown> | null | undefined): string {
  if (!customer) return '';
  const t = normalizeCustomerTier(
    (customer as Customer).customer_tier ?? (customer as any).customerTier
  );
  if (t === 'PREMIUM') {
    // !text-* wins over parent text-gray-900 on the same element (Tailwind merge order)
    return 'font-semibold !text-amber-600 dark:!text-amber-300';
  }
  if (t === 'WORST') {
    return 'font-semibold !text-red-600 dark:!text-red-400';
  }
  return '';
}
