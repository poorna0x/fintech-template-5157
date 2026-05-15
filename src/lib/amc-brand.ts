import { DocumentBrand, getDocumentBrandLabel, normalizeDocumentBrand } from './service-brands';

export function parseAmcAdditionalInfo(additionalInfo: unknown): Record<string, unknown> {
  if (!additionalInfo) return {};
  if (typeof additionalInfo === 'object' && !Array.isArray(additionalInfo)) {
    return additionalInfo as Record<string, unknown>;
  }
  if (typeof additionalInfo !== 'string') return {};
  try {
    return JSON.parse(additionalInfo) as Record<string, unknown>;
  } catch {
    return {};
  }
}

/** Legacy AMC rows without a brand are treated as Hydrogen RO. */
export function getAmcDocumentBrand(amc: {
  service_brand?: unknown;
  additional_info?: unknown;
}): DocumentBrand {
  const fromColumn = normalizeDocumentBrand(amc.service_brand);
  if (fromColumn) return fromColumn;
  const meta = parseAmcAdditionalInfo(amc.additional_info);
  const fromMeta = normalizeDocumentBrand(meta.document_brand);
  if (fromMeta) return fromMeta;
  return 'hydrogenro';
}

export function getAmcDocumentBrandLabel(
  amc: { service_brand?: unknown; additional_info?: unknown }
): string {
  return getDocumentBrandLabel(getAmcDocumentBrand(amc));
}

export function isMissingServiceBrandColumnError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const message = String((error as { message?: string }).message ?? '');
  const code = String((error as { code?: string }).code ?? '');
  return (
    message.includes('service_brand') ||
    code === 'PGRST204' ||
    message.includes('schema cache')
  );
}
