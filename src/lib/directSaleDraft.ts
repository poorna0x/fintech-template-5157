import { chromeStorage } from '@/lib/storage';
import type { DocumentBrand } from '@/lib/service-brands';

const DRAFT_KEY = 'admin_direct_sale_draft_v1';
/** Drafts live at most 24 hours. */
const DRAFT_TTL_MS = 24 * 60 * 60 * 1000;

export type DirectSaleDraftPaymentMode = 'CASH' | 'ONLINE' | 'PARTIAL';
export type DirectSaleDraftBillMode = 'set' | 'normal';

export type DirectSaleDraft = {
  version: 1;
  savedAt: number;
  amount: string;
  item: string;
  saleDate: string;
  customerName: string;
  customerPhone: string;
  billMode: DirectSaleDraftBillMode;
  sellPrices: Record<string, string>;
  paymentMode: DirectSaleDraftPaymentMode;
  partialCashAmount: string;
  partialOnlineAmount: string;
  selectedQrId: string;
  upiShareBrand: DocumentBrand;
  selectedQuantities: Record<string, string>;
  customItems: Array<{ id: string; name: string; quantity: string; unitPrice: string }>;
};

function isNonEmptyRecord(r: Record<string, string> | undefined): boolean {
  if (!r || typeof r !== 'object') return false;
  return Object.values(r).some((v) => String(v ?? '').trim() !== '');
}

/** Only persist when the admin typed or selected something real. */
export function isDirectSaleDraftMeaningful(draft: DirectSaleDraft | null): boolean {
  if (!draft) return false;
  if ((draft.amount ?? '').trim() !== '') return true;
  if ((draft.item ?? '').trim() !== '') return true;
  if ((draft.customerName ?? '').trim() !== '') return true;
  if ((draft.customerPhone ?? '').trim() !== '') return true;
  if (draft.paymentMode && draft.paymentMode !== 'CASH') return true;
  if ((draft.partialCashAmount ?? '').trim() !== '') return true;
  if ((draft.partialOnlineAmount ?? '').trim() !== '') return true;
  if ((draft.selectedQrId ?? '').trim() !== '') return true;
  if (isNonEmptyRecord(draft.sellPrices)) return true;
  if (isNonEmptyRecord(draft.selectedQuantities)) return true;
  if (Array.isArray(draft.customItems) && draft.customItems.length > 0) return true;
  if (draft.billMode === 'normal') return true;
  return false;
}

export function readDirectSaleDraft(): DirectSaleDraft | null {
  try {
    const raw = chromeStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DirectSaleDraft;
    if (parsed?.version !== 1) {
      clearDirectSaleDraft();
      return null;
    }
    if (!parsed.savedAt || Date.now() - parsed.savedAt > DRAFT_TTL_MS) {
      clearDirectSaleDraft();
      return null;
    }
    if (!isDirectSaleDraftMeaningful(parsed)) {
      clearDirectSaleDraft();
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function writeDirectSaleDraft(draft: Omit<DirectSaleDraft, 'version' | 'savedAt'>): void {
  try {
    const full: DirectSaleDraft = {
      ...draft,
      version: 1,
      savedAt: Date.now(),
    };
    if (!isDirectSaleDraftMeaningful(full)) {
      clearDirectSaleDraft();
      return;
    }
    chromeStorage.setItem(DRAFT_KEY, JSON.stringify(full));
  } catch {
    /* quota / private mode */
  }
}

export function clearDirectSaleDraft(): void {
  try {
    chromeStorage.removeItem(DRAFT_KEY);
  } catch {
    /* ignore */
  }
}

export function hasDirectSaleDraft(): boolean {
  return readDirectSaleDraft() !== null;
}
