export type QuotationImageAlign = 'left' | 'center' | 'right';
export type QuotationImageSize = 'small' | 'medium' | 'large' | 'full';
export type QuotationImageColumns = 1 | 2 | 3 | 4;

export interface QuotationImageBlock {
  id: string;
  heading: string;
  subheading: string;
  images: string[];
  columns: QuotationImageColumns;
  size: QuotationImageSize;
  align: QuotationImageAlign;
}

export function createQuotationImageBlock(
  partial?: Partial<QuotationImageBlock>
): QuotationImageBlock {
  return {
    id: partial?.id || `qimg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    heading: typeof partial?.heading === 'string' ? partial.heading : 'Product Images',
    subheading: typeof partial?.subheading === 'string' ? partial.subheading : '',
    images: Array.isArray(partial?.images) ? partial.images.filter(isHttpsImageUrl) : [],
    columns: normalizeColumns(partial?.columns),
    size: normalizeSize(partial?.size),
    align: normalizeAlign(partial?.align),
  };
}

export function isHttpsImageUrl(url: unknown): url is string {
  if (typeof url !== 'string') return false;
  const trimmed = url.trim();
  if (!/^https:\/\//i.test(trimmed)) return false;
  try {
    return new URL(trimmed).protocol === 'https:';
  } catch {
    return false;
  }
}

function normalizeColumns(value: unknown): QuotationImageColumns {
  const n = Number(value);
  if (n === 1 || n === 2 || n === 3 || n === 4) return n;
  return 2;
}

function normalizeSize(value: unknown): QuotationImageSize {
  if (value === 'small' || value === 'medium' || value === 'large' || value === 'full') return value;
  return 'medium';
}

function normalizeAlign(value: unknown): QuotationImageAlign {
  if (value === 'left' || value === 'center' || value === 'right') return value;
  return 'center';
}

/** Normalize blocks from drafts / Bill / PDF data; migrate legacy flat fields. */
export function normalizeQuotationImageBlocks(
  input: unknown,
  legacy?: { heading?: unknown; images?: unknown }
): QuotationImageBlock[] {
  if (Array.isArray(input) && input.length > 0) {
    return input
      .map((raw) => {
        if (!raw || typeof raw !== 'object') return null;
        const row = raw as Record<string, unknown>;
        const block = createQuotationImageBlock({
          id: typeof row.id === 'string' ? row.id : undefined,
          heading: typeof row.heading === 'string' ? row.heading : 'Product Images',
          subheading: typeof row.subheading === 'string' ? row.subheading : '',
          images: Array.isArray(row.images) ? (row.images as unknown[]) : [],
          columns: row.columns as QuotationImageColumns | undefined,
          size: row.size as QuotationImageSize | undefined,
          align: row.align as QuotationImageAlign | undefined,
        });
        return block.images.length > 0 || block.heading || block.subheading ? block : null;
      })
      .filter((b): b is QuotationImageBlock => Boolean(b));
  }

  const legacyImages = Array.isArray(legacy?.images)
    ? (legacy!.images as unknown[]).filter(isHttpsImageUrl)
    : [];
  if (legacyImages.length === 0) return [];

  return [
    createQuotationImageBlock({
      heading:
        typeof legacy?.heading === 'string' && legacy.heading.trim()
          ? legacy.heading.trim()
          : 'Product Images',
      images: legacyImages,
      columns: 2,
      size: 'medium',
      align: 'center',
    }),
  ];
}

/** Blocks that will actually print (at least one image). */
export function quotationImageBlocksForPdf(blocks: QuotationImageBlock[]): QuotationImageBlock[] {
  return blocks
    .map((b) => ({
      ...b,
      images: b.images.filter(isHttpsImageUrl),
      heading: (b.heading || '').trim(),
      subheading: (b.subheading || '').trim(),
    }))
    .filter((b) => b.images.length > 0);
}
