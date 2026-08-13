import type { AdminStatusFilter } from '@/lib/adminDashboardCache';

/** Job list tabs on /admin (dashboard home). */
export const ADMIN_JOB_TAB_SLUGS = ['ongoing', 'followup', 'denied', 'completed'] as const;
export type AdminJobTabSlug = (typeof ADMIN_JOB_TAB_SLUGS)[number];

/** Full-screen or modal overlays opened from the job dashboard. */
export const ADMIN_MODAL_SLUGS = [
  'assign',
  'reassign',
  'complete',
  'edit-job',
  'edit-completed',
  'photos',
  'photo-viewer',
  'bill',
  'report',
  'history',
  'follow-up',
  'deny',
  'move-ongoing',
  'send-message',
  'completion-email',
  'job-parts',
  'office-parts',
  'share-job-info',
  'add-reminder',
  'warranty',
  'ongoing-filters',
  'completed-filters',
  'customer-photos',
  'whatsapp',
  'edit-customer',
  'add-customer',
  'new-job',
  'more-options',
  'delete-job',
] as const;
export type AdminModalSlug = (typeof ADMIN_MODAL_SLUGS)[number];

const MODAL_PARAM_KEYS = ['modal', 'job', 'customer', 'photo', 'photoIdx'] as const;

export function isAdminJobTabSlug(value: string | null): value is AdminJobTabSlug {
  return Boolean(value && (ADMIN_JOB_TAB_SLUGS as readonly string[]).includes(value));
}

export function isAdminModalSlug(value: string | null): value is AdminModalSlug {
  return Boolean(value && (ADMIN_MODAL_SLUGS as readonly string[]).includes(value));
}

export function jobTabSlugToStatusFilter(slug: AdminJobTabSlug | null | undefined): AdminStatusFilter {
  switch (slug) {
    case 'followup':
      return 'RESCHEDULED';
    case 'denied':
      return 'CANCELLED';
    case 'completed':
      return 'COMPLETED';
    case 'ongoing':
    default:
      return 'ONGOING';
  }
}

/** URL slug for a job list tab; `ongoing` is omitted from the URL (default). */
export function statusFilterToJobTabSlug(filter: AdminStatusFilter): AdminJobTabSlug | undefined {
  switch (filter) {
    case 'RESCHEDULED':
      return 'followup';
    case 'CANCELLED':
      return 'denied';
    case 'COMPLETED':
      return 'completed';
    case 'ONGOING':
      return undefined;
    default:
      return undefined;
  }
}

export type ParsedAdminDashboardUrl = {
  tab: AdminJobTabSlug | null;
  view: string | null;
  tool: string | null;
  type: string | null;
  search: string | null;
  searchAction: 'photos' | null;
  modal: AdminModalSlug | null;
  jobId: string | null;
  customerId: string | null;
  photoType: 'before' | 'after' | null;
  photoIdx: number | null;
  /** Payments deep-link: open Add technician / business expense dialog. */
  addExpense: 'technician' | 'business' | null;
  /** yyyy-mm-dd from expense-review push — prefill Add expense date. */
  expenseDate: string | null;
};

export function parseAdminDashboardUrl(search: string): ParsedAdminDashboardUrl {
  const sp = new URLSearchParams(search);
  const photo = sp.get('photo');
  const photoIdxRaw = sp.get('photoIdx');
  const modalRaw = sp.get('modal');
  let photoIdx: number | null = null;
  if (photoIdxRaw != null && photoIdxRaw !== '') {
    const n = parseInt(photoIdxRaw, 10);
    photoIdx = Number.isFinite(n) ? n : null;
  }
  const actionRaw = sp.get('action');
  const addExpenseRaw = sp.get('addExpense');
  const expenseDateRaw = String(sp.get('expenseDate') || '').trim();
  return {
    tab: isAdminJobTabSlug(sp.get('tab')) ? (sp.get('tab') as AdminJobTabSlug) : null,
    view: sp.get('view'),
    tool: sp.get('tool'),
    type: sp.get('type'),
    search: sp.get('search'),
    searchAction: actionRaw === 'photos' ? 'photos' : null,
    modal: isAdminModalSlug(modalRaw) ? modalRaw : null,
    jobId: sp.get('job'),
    customerId: sp.get('customer'),
    photoType: photo === 'before' || photo === 'after' ? photo : null,
    photoIdx,
    addExpense:
      addExpenseRaw === 'technician' || addExpenseRaw === 'business' ? addExpenseRaw : null,
    expenseDate: /^\d{4}-\d{2}-\d{2}$/.test(expenseDateRaw) ? expenseDateRaw : null,
  };
}

export type AdminDashboardSearchPatch = {
  tab?: AdminJobTabSlug | null;
  view?: string | null;
  tool?: string | null;
  type?: string | null;
  search?: string | null;
  searchAction?: 'photos' | null;
  modal?: AdminModalSlug | null;
  jobId?: string | null;
  customerId?: string | null;
  photoType?: 'before' | 'after' | null;
  photoIdx?: number | null;
  addExpense?: 'technician' | 'business' | null;
  expenseDate?: string | null;
  clearModal?: boolean;
  clearView?: boolean;
  clearTool?: boolean;
  clearSearch?: boolean;
};

export function buildAdminDashboardSearch(
  patch: AdminDashboardSearchPatch,
  currentSearch = ''
): string {
  const sp = new URLSearchParams(currentSearch);

  if (patch.clearView) {
    sp.delete('view');
    sp.delete('type');
    sp.delete('addExpense');
    sp.delete('expenseDate');
  }
  if (patch.clearTool) {
    sp.delete('tool');
  }
  if (patch.clearSearch) {
    sp.delete('search');
    sp.delete('action');
  }
  if (patch.clearModal) {
    for (const key of MODAL_PARAM_KEYS) {
      sp.delete(key);
    }
  }

  const setOrDelete = (key: string, val: string | null | undefined) => {
    if (val === null || val === undefined || val === '') {
      sp.delete(key);
    } else {
      sp.set(key, val);
    }
  };

  if (patch.tab !== undefined) {
    if (patch.tab === null || patch.tab === 'ongoing') {
      sp.delete('tab');
    } else {
      sp.set('tab', patch.tab);
    }
  }
  if (patch.view !== undefined) setOrDelete('view', patch.view);
  if (patch.tool !== undefined) setOrDelete('tool', patch.tool);
  if (patch.type !== undefined) setOrDelete('type', patch.type);
  if (patch.search !== undefined) setOrDelete('search', patch.search);
  if (patch.searchAction !== undefined) {
    if (patch.searchAction === null) {
      sp.delete('action');
    } else {
      sp.set('action', patch.searchAction);
    }
  }
  if (patch.modal !== undefined) setOrDelete('modal', patch.modal);
  if (patch.jobId !== undefined) setOrDelete('job', patch.jobId);
  if (patch.customerId !== undefined) setOrDelete('customer', patch.customerId);
  if (patch.photoType !== undefined) setOrDelete('photo', patch.photoType);
  if (patch.photoIdx !== undefined) {
    if (patch.photoIdx === null) {
      sp.delete('photoIdx');
    } else {
      sp.set('photoIdx', String(patch.photoIdx));
    }
  }
  if (patch.addExpense !== undefined) {
    setOrDelete('addExpense', patch.addExpense);
    if (patch.addExpense === null) sp.delete('expenseDate');
  }
  if (patch.expenseDate !== undefined) setOrDelete('expenseDate', patch.expenseDate);

  const qs = sp.toString();
  return qs ? `?${qs}` : '';
}

export function adminDashboardLocation(search: string): { pathname: string; search: string } {
  const normalized = search.startsWith('?') ? search : search ? `?${search}` : '';
  return { pathname: '/admin', search: normalized };
}

/** Full-screen tab views on /admin (payments, billing, etc.). */
export const ADMIN_TAB_VIEWS = ['payments', 'billing', 'analytics', 'inventory'] as const;
export type AdminTabView = (typeof ADMIN_TAB_VIEWS)[number];
export type AdminDashboardView = 'dashboard' | AdminTabView;

export function readAdminTabViewFromSearch(search: string): AdminDashboardView {
  const view = new URLSearchParams(search).get('view');
  if (view && (ADMIN_TAB_VIEWS as readonly string[]).includes(view)) {
    return view as AdminTabView;
  }
  return 'dashboard';
}

export function isAdminTabViewParam(view: string | null): view is AdminTabView {
  return Boolean(view && (ADMIN_TAB_VIEWS as readonly string[]).includes(view));
}

/** Full-screen overlay views (GST invoices, AMC view, letterhead builder). */
export const ADMIN_OVERLAY_VIEWS = ['gst-invoices', 'amc-view', 'letterhead-documents'] as const;
export type AdminOverlayView = (typeof ADMIN_OVERLAY_VIEWS)[number];

export function isAdminOverlayViewParam(view: string | null): view is AdminOverlayView {
  return Boolean(view && (ADMIN_OVERLAY_VIEWS as readonly string[]).includes(view));
}

export type LetterheadDocumentType =
  | 'service_report'
  | 'amc_report'
  | 'custom_document'
  | 'letterhead';

export const LETTERHEAD_DOCUMENT_TYPES: LetterheadDocumentType[] = [
  'service_report',
  'amc_report',
  'custom_document',
  'letterhead',
];

export function readLetterheadTypeFromSearch(search: string): LetterheadDocumentType | undefined {
  const typeParam = new URLSearchParams(search).get('type') as LetterheadDocumentType | null;
  if (typeParam && LETTERHEAD_DOCUMENT_TYPES.includes(typeParam)) return typeParam;
  return undefined;
}

export function readAdminOverlayFromSearch(search: string): {
  gst: boolean;
  amc: boolean;
  letterhead: boolean;
  letterheadType?: LetterheadDocumentType;
} {
  const view = new URLSearchParams(search).get('view');
  const letterhead = view === 'letterhead-documents';
  return {
    gst: view === 'gst-invoices',
    amc: view === 'amc-view',
    letterhead,
    letterheadType: letterhead ? readLetterheadTypeFromSearch(search) : undefined,
  };
}

/** Tool dialogs opened via ?tool=… on the admin dashboard. */
export const ADMIN_TOOL_DIALOGS = [
  'recent-accounts',
  'quick-customer',
  'direct-sale',
  'amount-trackers',
  'sent-email-log',
  'measure-distance',
  'arrange-visit-order',
  'nearby-jobs',
  'technician-live-location',
  'message-technician',
] as const;
export type AdminToolDialog = (typeof ADMIN_TOOL_DIALOGS)[number];

export const MANAGER_BLOCKED_ADMIN_TOOLS = new Set<AdminToolDialog>(['direct-sale', 'amount-trackers']);

export function isAdminToolParam(tool: string | null): tool is AdminToolDialog {
  return Boolean(tool && (ADMIN_TOOL_DIALOGS as readonly string[]).includes(tool));
}
