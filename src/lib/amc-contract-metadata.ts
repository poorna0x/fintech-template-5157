/** Parse `amc_contracts.additional_info` into a metadata object. */
export function parseAmcAdditionalInfoMetadata(raw: unknown): Record<string, unknown> {
  if (!raw) return {};
  if (typeof raw === 'object' && raw !== null) return { ...(raw as Record<string, unknown>) };
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return typeof parsed === 'object' && parsed !== null ? { ...parsed } : { notes: raw };
    } catch {
      return { notes: raw };
    }
  }
  return {};
}

function parsePositiveAmount(value: unknown): number | null {
  if (value == null || value === '') return null;
  const n = typeof value === 'number' ? value : parseFloat(String(value).replace(/,/g, ''));
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

/** Read AMC agreement amount from contract row / metadata (matches AdminDashboard display priority). */
export function getAmcAmountFromContract(
  amcContract: { additional_info?: unknown; amount?: unknown } | null | undefined,
): number | null {
  if (!amcContract) return null;
  const meta = parseAmcAdditionalInfoMetadata(amcContract.additional_info);
  const candidates = [
    meta.agreed_amount,
    meta.agreed,
    meta.amc_cost,
    meta.total_amount,
    meta.amount,
    meta.agreement_amount,
    meta.amcAmount,
    amcContract.amount,
  ];
  for (const candidate of candidates) {
    const parsed = parsePositiveAmount(candidate);
    if (parsed != null && parsed > 0) return parsed;
  }
  return null;
}

/** Sync amount across common metadata keys used by generators and dashboards. */
export function applyAmcAmountToMetadata(
  metadata: Record<string, unknown>,
  amount: number | null | undefined,
): Record<string, unknown> {
  const next = { ...metadata };
  const parsed = amount == null ? null : parsePositiveAmount(amount);

  if (parsed == null || parsed <= 0) {
    return next;
  }

  next.amc_cost = parsed;
  next.total_amount = parsed;
  next.amount = parsed;

  if ('agreed_amount' in next) next.agreed_amount = parsed;
  if ('agreement_amount' in next) next.agreement_amount = parsed;
  if ('amcAmount' in next) next.amcAmount = parsed;

  return next;
}
