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
  'job-parts',
  'office-parts',
  'warranty',
  'ongoing-filters',
  'completed-filters',
  'customer-photos',
  'whatsapp',
  'edit-customer',
  'new-job',
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
  modal: AdminModalSlug | null;
  jobId: string | null;
  customerId: string | null;
  photoType: 'before' | 'after' | null;
  photoIdx: number | null;
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
  return {
    tab: isAdminJobTabSlug(sp.get('tab')) ? (sp.get('tab') as AdminJobTabSlug) : null,
    view: sp.get('view'),
    tool: sp.get('tool'),
    type: sp.get('type'),
    modal: isAdminModalSlug(modalRaw) ? modalRaw : null,
    jobId: sp.get('job'),
    customerId: sp.get('customer'),
    photoType: photo === 'before' || photo === 'after' ? photo : null,
    photoIdx,
  };
}

export type AdminDashboardSearchPatch = {
  tab?: AdminJobTabSlug | null;
  view?: string | null;
  tool?: string | null;
  type?: string | null;
  modal?: AdminModalSlug | null;
  jobId?: string | null;
  customerId?: string | null;
  photoType?: 'before' | 'after' | null;
  photoIdx?: number | null;
  clearModal?: boolean;
  clearView?: boolean;
  clearTool?: boolean;
};

export function buildAdminDashboardSearch(
  patch: AdminDashboardSearchPatch,
  currentSearch = ''
): string {
  const sp = new URLSearchParams(currentSearch);

  if (patch.clearView) {
    sp.delete('view');
    sp.delete('type');
  }
  if (patch.clearTool) {
    sp.delete('tool');
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

  const qs = sp.toString();
  return qs ? `?${qs}` : '';
}

export function adminDashboardLocation(search: string): { pathname: string; search: string } {
  const normalized = search.startsWith('?') ? search : search ? `?${search}` : '';
  return { pathname: '/admin', search: normalized };
}
