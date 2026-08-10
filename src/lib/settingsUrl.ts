/** Full-screen overlays and dialogs on /settings (mobile back / swipe-back). */
export const SETTINGS_PANELS = [
  'calling',
  'whatsapp-inbox',
  'whatsapp-settings',
  'reminders',
  'recurring-service',
  'pending-payments',
  'advanced-search',
  'add-general-reminder',
  'add-customer-reminder',
  'merge-customers',
  'warranty',
  'pdf-authenticity',
  'direct-sale',
  'add-technician',
  'edit-technician',
  'add-payment-qr',
  'edit-payment-qr',
  'add-tech-qr',
  'edit-tech-qr',
  'add-product-qr',
  'edit-product-qr',
  'add-todo',
  'add-tracker',
] as const;

export type SettingsPanelSlug = (typeof SETTINGS_PANELS)[number];

const PANEL_PARAM_KEYS = ['panel', 'id', 'action'] as const;

export function isSettingsPanelSlug(value: string | null): value is SettingsPanelSlug {
  return Boolean(value && (SETTINGS_PANELS as readonly string[]).includes(value));
}

export type ParsedSettingsUrl = {
  panel: SettingsPanelSlug | null;
  panelId: string | null;
  panelAction: string | null;
  section: string | null;
};

/** Parse /settings query — legacy `section=calling&action=open` maps to panel calling. */
export function parseSettingsUrl(search: string): ParsedSettingsUrl {
  const sp = new URLSearchParams(search);
  const section = sp.get('section');
  const action = sp.get('action');
  let panelRaw = sp.get('panel');

  if (!panelRaw && section === 'calling' && action === 'open') {
    panelRaw = 'calling';
  }

  return {
    panel: isSettingsPanelSlug(panelRaw) ? panelRaw : null,
    panelId: sp.get('id'),
    panelAction: sp.get('action'),
    section,
  };
}

export type SettingsSearchPatch = {
  panel?: SettingsPanelSlug | null;
  panelId?: string | null;
  panelAction?: string | null;
  section?: string | null;
  clearPanel?: boolean;
};

export function buildSettingsSearch(patch: SettingsSearchPatch, currentSearch = ''): string {
  const sp = new URLSearchParams(currentSearch);

  if (patch.clearPanel) {
    for (const key of PANEL_PARAM_KEYS) {
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

  if (patch.panel !== undefined) {
    setOrDelete('panel', patch.panel);
    if (!patch.panel) {
      sp.delete('id');
      sp.delete('action');
    }
  }
  if (patch.panelId !== undefined) setOrDelete('id', patch.panelId);
  if (patch.panelAction !== undefined) setOrDelete('action', patch.panelAction);
  if (patch.section !== undefined) setOrDelete('section', patch.section);

  const qs = sp.toString();
  return qs ? `?${qs}` : '';
}

export function settingsLocation(search: string): { pathname: string; search: string } {
  const normalized = search.startsWith('?') ? search : search ? `?${search}` : '';
  return { pathname: '/settings', search: normalized };
}

export function settingsPanelPath(
  panel: SettingsPanelSlug,
  options?: { id?: string; action?: string }
): string {
  const qs = new URLSearchParams({ panel });
  if (options?.id) qs.set('id', options.id);
  if (options?.action) qs.set('action', options.action);
  return `/settings?${qs.toString()}`;
}
