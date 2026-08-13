import { toast } from 'sonner';
import {
  WhatsAppInboundToast,
  WhatsAppPermissionToast,
} from '@/components/whatsapp/WhatsAppInboundToast';

const CUSTOM_TOAST_CLASS =
  '!p-0 !bg-transparent !border-0 !shadow-none !ring-0 group-[.toast]:!p-0';

/** Show Clear all once this many inbound WA toasts are open. */
export const WA_INBOUND_CLEAR_ALL_THRESHOLD = 2;

/** Insertion order: index 0 = oldest (bottom of top-right stack). */
const activeInboundToastIds: Array<string | number> = [];
const countListeners = new Set<(count: number) => void>();

function emitInboundToastCount(): void {
  const count = activeInboundToastIds.length;
  for (const listener of countListeners) listener(count);
}

export function getWhatsAppInboundToastCount(): number {
  return activeInboundToastIds.length;
}

/** Oldest open inbound toast id (bottom of stack with newest-on-top). */
export function getOldestWhatsAppInboundToastId(): string | number | null {
  return activeInboundToastIds[0] ?? null;
}

export function subscribeWhatsAppInboundToastCount(
  listener: (count: number) => void
): () => void {
  countListeners.add(listener);
  listener(activeInboundToastIds.length);
  return () => {
    countListeners.delete(listener);
  };
}

function unregisterInboundToast(toastId: string | number): void {
  const idx = activeInboundToastIds.indexOf(toastId);
  if (idx < 0) return;
  activeInboundToastIds.splice(idx, 1);
  emitInboundToastCount();
}

/** Dismiss every open WhatsApp inbound alert toast. */
export function clearAllWhatsAppInboundToasts(): void {
  for (const id of [...activeInboundToastIds]) {
    toast.dismiss(id);
  }
  activeInboundToastIds.length = 0;
  emitInboundToastCount();
}

export function showWhatsAppInboundToast(opts: {
  contactName: string;
  preview: string;
  onOpen: () => void;
}): void {
  const toastId = toast.custom(
    (id) => (
      <WhatsAppInboundToast
        toastId={id}
        contactName={opts.contactName}
        preview={opts.preview}
        onOpen={() => {
          toast.dismiss(id);
          unregisterInboundToast(id);
          opts.onOpen();
        }}
        onDismiss={() => {
          toast.dismiss(id);
          unregisterInboundToast(id);
        }}
      />
    ),
    {
      // Stay until user taps Open or dismiss — no auto-clear.
      duration: Infinity,
      unstyled: true,
      closeButton: false,
      className: CUSTOM_TOAST_CLASS,
      onDismiss: (t) => unregisterInboundToast(t.id),
      onAutoClose: (t) => unregisterInboundToast(t.id),
    }
  );

  activeInboundToastIds.push(toastId);
  emitInboundToastCount();
}

export function showWhatsAppDesktopPermissionToast(opts: {
  onEnable: () => void;
  durationMs?: number;
}): void {
  toast.custom(
    (toastId) => (
      <WhatsAppPermissionToast
        onEnable={() => {
          toast.dismiss(toastId);
          opts.onEnable();
        }}
        onDismiss={() => toast.dismiss(toastId)}
      />
    ),
    {
      duration: opts.durationMs ?? 14_000,
      unstyled: true,
      className: CUSTOM_TOAST_CLASS,
    }
  );
}
