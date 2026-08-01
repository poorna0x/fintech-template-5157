import { chromeStorage } from '@/lib/storage';

type ServiceBrand = 'elevenro' | 'hydrogenro';

const DRAFT_KEY_PREFIX = 'tech_complete_job_draft_';
/** Drafts live at most 24 hours. After that they self-expire on next read. */
const DRAFT_TTL_MS = 24 * 60 * 60 * 1000;
/** Hard cap so a stuck device cannot blow up localStorage. Oldest drafts are evicted first. */
const DRAFT_MAX_COUNT = 30;

export type CompleteJobDraftStep = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export type TechnicianCompleteJobDraft = {
  version: 1;
  jobId: string;
  savedAt: number;
  completeJobStep: CompleteJobDraftStep;
  completionNotes: string;
  billAmount: string;
  billPhotos: string[];
  optionalCompletionPhotos: string[];
  extraPhotosStep6: string[];
  dontSendMessageToCustomer: boolean;
  amcDateGiven: string;
  amcEndDate: string;
  amcYears: number;
  amcIncludesPrefilter: boolean | null;
  amcAdditionalInfo: string;
  amcAmount: string;
  amcServicePeriodKind: '' | '4' | '6' | 'custom' | 'no_auto';
  amcServicePeriodCustomMonths: number;
  hasAMC: boolean | null;
  paymentMode: 'CASH' | 'ONLINE' | 'PARTIAL' | 'PENDING_PAYMENT' | '';
  partialCashAmount: string;
  partialOnlineAmount: string;
  pendingPaidTodayEnabled?: boolean;
  pendingPaidTodayMode?: 'CASH' | 'ONLINE' | 'PARTIAL' | '';
  pendingPaidTodayAmount?: string;
  promisedPaymentDate?: string;
  customerHasPrefilter: boolean | null;
  rawWaterTds: string;
  qrCodeType: string;
  selectedQrCodeId: string;
  paymentScreenshot: string;
  otpInput: string[];
  serviceBrand: ServiceBrand | null;
  selectedQrCodeName?: string;
  selectedQrCodeUrl?: string;
  /** Timestamp when Phase A (data save) succeeded on the server. If set, the
   *  data is already on the job row and only Phase B (status flip to
   *  COMPLETED) still needs to run. Survives refresh / dialog close. */
  phaseASavedAt?: number | null;
  /** True when the wizard should resume in finish-only mode: a previous Phase
   *  A succeeded but Phase B failed, so the technician only needs to retry
   *  the status flip. Survives refresh / dialog close. */
  retryPhaseBOnly?: boolean;
};

export function friendlyCompletionErrorMessage(raw: unknown): string {
  const msg = String((raw as any)?.message ?? raw ?? '').trim();
  const lower = msg.toLowerCase();
  if (!msg) return "We couldn't save the job. Please try again.";
  if (
    lower.includes('failed to fetch') ||
    lower.includes('network request failed') ||
    lower.includes('networkerror') ||
    lower.includes('load failed')
  ) {
    return 'Network issue — check your internet and try again. Your progress is saved.';
  }
  if (lower.includes('timeout') || lower.includes('taking longer than expected')) {
    return 'Your connection is very slow. Your progress is saved — try again in a moment.';
  }
  if (lower.includes('aborterror') || lower.includes('signal is aborted')) {
    return 'The request was cancelled. Your progress is saved — please try again.';
  }
  if (lower.includes('not found') || lower.includes('pgrst116')) {
    return "Couldn't find the job on the server. Please refresh and try again.";
  }
  if (lower.includes('permission') || lower.includes('rls') || lower.includes('not authorized')) {
    return 'You no longer have permission for this action. Please log in again.';
  }
  if (lower.startsWith('5') || lower.includes('internal server')) {
    return 'Server error. Your progress is saved — please try again in a moment.';
  }
  return msg;
}

function draftKey(jobId: string): string {
  return `${DRAFT_KEY_PREFIX}${jobId}`;
}

/**
 * A draft is "meaningful" only when the technician has actually entered or uploaded something.
 * Auto-prefilled values (last service brand from customer, default AMC date, customer prefilter/TDS, etc.)
 * are NOT considered meaningful — opening the dialog and closing it without doing anything must NOT save a draft.
 */
export function isCompleteJobDraftMeaningful(draft: TechnicianCompleteJobDraft | null): boolean {
  if (!draft) return false;
  // Phase A already saved on the server / retry-only mode is a "meaningful"
  // state on its own — the user must finish or explicitly start over.
  if (draft.phaseASavedAt) return true;
  if (draft.retryPhaseBOnly) return true;
  if ((draft.completeJobStep ?? 1) > 1) return true;
  if ((draft.billAmount ?? '').trim() !== '') return true;
  if ((draft.completionNotes ?? '').trim() !== '') return true;
  if (Array.isArray(draft.billPhotos) && draft.billPhotos.length > 0) return true;
  if (Array.isArray(draft.optionalCompletionPhotos) && draft.optionalCompletionPhotos.length > 0) return true;
  if (Array.isArray(draft.extraPhotosStep6) && draft.extraPhotosStep6.length > 0) return true;
  if (draft.hasAMC !== null && draft.hasAMC !== undefined) return true;
  if (draft.paymentMode) return true;
  if ((draft.paymentScreenshot ?? '').trim() !== '') return true;
  if ((draft.partialCashAmount ?? '').trim() !== '') return true;
  if ((draft.partialOnlineAmount ?? '').trim() !== '') return true;
  if (draft.pendingPaidTodayEnabled) return true;
  if ((draft.promisedPaymentDate ?? '').trim() !== '') return true;
  if ((draft.selectedQrCodeId ?? '').trim() !== '') return true;
  if (Array.isArray(draft.otpInput) && draft.otpInput.some((d) => (d ?? '').trim() !== '')) return true;
  if (draft.dontSendMessageToCustomer === true) return true;
  return false;
}

export function readTechnicianCompleteJobDraft(jobId: string): TechnicianCompleteJobDraft | null {
  try {
    const raw = chromeStorage.getItem(draftKey(jobId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as TechnicianCompleteJobDraft;
    if (parsed?.version !== 1 || parsed.jobId !== jobId) return null;
    if (!parsed.savedAt || Date.now() - parsed.savedAt > DRAFT_TTL_MS) {
      clearTechnicianCompleteJobDraft(jobId);
      return null;
    }
    if (!isCompleteJobDraftMeaningful(parsed)) {
      clearTechnicianCompleteJobDraft(jobId);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function writeTechnicianCompleteJobDraft(draft: TechnicianCompleteJobDraft): void {
  try {
    if (!isCompleteJobDraftMeaningful(draft)) {
      clearTechnicianCompleteJobDraft(draft.jobId);
      return;
    }
    enforceDraftCap(draft.jobId);
    chromeStorage.setItem(
      draftKey(draft.jobId),
      JSON.stringify({ ...draft, version: 1, savedAt: Date.now() })
    );
  } catch {
    /* quota / private mode */
  }
}

/**
 * Read every existing draft (expired ones get garbage-collected on touch) and, if we are about
 * to add a NEW jobId and the total would exceed DRAFT_MAX_COUNT, evict the oldest drafts.
 */
function enforceDraftCap(incomingJobId: string): void {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return;
    const entries: Array<{ jobId: string; savedAt: number }> = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (!key || !key.startsWith(DRAFT_KEY_PREFIX)) continue;
      const jobId = key.slice(DRAFT_KEY_PREFIX.length);
      if (!jobId) continue;
      const raw = window.localStorage.getItem(key);
      if (!raw) continue;
      try {
        const parsed = JSON.parse(raw) as TechnicianCompleteJobDraft;
        const savedAt = parsed?.savedAt ?? 0;
        if (!savedAt || Date.now() - savedAt > DRAFT_TTL_MS) {
          window.localStorage.removeItem(key);
          continue;
        }
        entries.push({ jobId, savedAt });
      } catch {
        window.localStorage.removeItem(key);
      }
    }
    const willGrow = !entries.some((e) => e.jobId === incomingJobId);
    if (!willGrow) return;
    if (entries.length + 1 <= DRAFT_MAX_COUNT) return;
    entries.sort((a, b) => a.savedAt - b.savedAt);
    const evictCount = entries.length + 1 - DRAFT_MAX_COUNT;
    for (let i = 0; i < evictCount; i++) {
      clearTechnicianCompleteJobDraft(entries[i].jobId);
    }
  } catch {
    /* never let bookkeeping break a save */
  }
}

export function clearTechnicianCompleteJobDraft(jobId: string): void {
  try {
    chromeStorage.removeItem(draftKey(jobId));
  } catch {
    /* ignore */
  }
}

export function hasTechnicianCompleteJobDraft(jobId: string): boolean {
  return readTechnicianCompleteJobDraft(jobId) !== null;
}

/** Return a Set of jobIds that currently have a saved completion draft. */
export function listTechnicianCompleteJobDraftIds(): Set<string> {
  const ids = new Set<string>();
  try {
    if (typeof window === 'undefined' || !window.localStorage) return ids;
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (!key || !key.startsWith(DRAFT_KEY_PREFIX)) continue;
      const jobId = key.slice(DRAFT_KEY_PREFIX.length);
      if (!jobId) continue;
      const draft = readTechnicianCompleteJobDraft(jobId);
      if (draft) ids.add(jobId);
    }
  } catch {
    /* ignore */
  }
  return ids;
}

/** Strip server-side draft marker from requirements array before job is marked completed. */
export function stripCompletionDraftMarkers(requirements: unknown[]): unknown[] {
  return requirements.filter((req: any) => req && typeof req === 'object' && !req.completion_draft);
}

export function parseJobRequirementsArray(requirements: unknown): any[] {
  if (Array.isArray(requirements)) return [...requirements];
  if (typeof requirements === 'string') {
    try {
      const parsed = JSON.parse(requirements);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}
