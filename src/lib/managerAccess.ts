/**
 * Manager role UI access control (admin_users.role = MANAGER).
 * UI-only — pair with server/RLS if you need hard enforcement later.
 */

export const MANAGER_RESTRICTED_TITLE = 'Restricted for Manager role';

/** Admin dashboard ?view=… tabs managers must not open. */
export const MANAGER_BLOCKED_ADMIN_VIEWS = new Set<string>([
  'payments',
  'billing',
  'analytics',
  'inventory',
  'gst-invoices',
]);

/** Admin Tools dialogs managers must not open. */
export const MANAGER_BLOCKED_ADMIN_TOOLS = new Set<string>([
  'direct-sale',
  'amount-trackers',
]);

/**
 * Settings ?panel=… overlays managers must not open.
 * Inbox / calling / reminders / warranty / pending payments stay allowed.
 */
export const MANAGER_BLOCKED_SETTINGS_PANELS = new Set<string>([
  'whatsapp-settings',
  'pdf-authenticity',
  'db-storage',
  'direct-sale',
  'merge-customers',
  'add-technician',
  'edit-technician',
  'add-payment-qr',
  'edit-payment-qr',
  'add-tech-qr',
  'edit-tech-qr',
  'add-product-qr',
  'edit-product-qr',
  'add-tracker',
  'lead-catalog',
]);

export function isManagerBlockedAdminView(view: string | null | undefined): boolean {
  return Boolean(view && MANAGER_BLOCKED_ADMIN_VIEWS.has(view));
}

export function isManagerBlockedAdminTool(tool: string | null | undefined): boolean {
  return Boolean(tool && MANAGER_BLOCKED_ADMIN_TOOLS.has(tool));
}

export function isManagerBlockedSettingsPanel(
  panel: string | null | undefined
): boolean {
  return Boolean(panel && MANAGER_BLOCKED_SETTINGS_PANELS.has(panel));
}
