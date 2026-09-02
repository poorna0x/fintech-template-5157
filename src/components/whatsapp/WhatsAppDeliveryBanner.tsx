import { useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { AlertCircle, X } from 'lucide-react';
import { toast } from 'sonner';
import {
  clearWhatsAppDeliveryBanner,
  getWhatsAppDeliveryBanner,
  showWhatsAppDeliveryBanner,
  subscribeWhatsAppDeliveryBanner,
} from '@/lib/whatsappDeliveryBannerStore';

function subscribe(onChange: () => void) {
  return subscribeWhatsAppDeliveryBanner(onChange);
}

/** Show the on-screen banner and drop the loading toast (do not use toast.error). */
export function reportWhatsAppPdfNotDelivered(
  message: string,
  toastId?: string | number,
  title?: string
): void {
  const text = String(message || '').trim() || 'Could not send on WhatsApp';
  showWhatsAppDeliveryBanner(text, title);
  if (toastId != null) toast.dismiss(toastId);
}

/** One number worked, another did not — keep the successful send, explain the failure. */
export function reportWhatsAppPdfPartialDelivery(opts: {
  sent: number;
  total: number;
  lastError: string;
  toastId?: string | number;
}): string {
  const err = String(opts.lastError || '').trim() || 'Could not send to one number';
  const title = `PDF sent to ${opts.sent} of ${opts.total} numbers`;
  reportWhatsAppPdfNotDelivered(err, opts.toastId, title);
  return `${title}. ${err}`;
}

export { clearWhatsAppDeliveryBanner };

/** Full-screen error banner for undeliverable WhatsApp PDFs — stays until dismissed. */
export function WhatsAppDeliveryBannerHost() {
  const banner = useSyncExternalStore(
    subscribe,
    getWhatsAppDeliveryBanner,
    () => null
  );
  if (!banner || typeof document === 'undefined') return null;

  return createPortal(
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[2147483646] flex justify-center p-3 sm:p-4">
      <div
        role="alert"
        className="pointer-events-auto flex w-full max-w-lg items-start gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3.5 text-red-950 shadow-[0_12px_40px_-10px_rgba(127,29,29,0.35)] ring-1 ring-red-900/10"
      >
        <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold leading-snug">{banner.title}</p>
          <p className="mt-1 text-sm leading-snug text-red-900/90">{banner.message}</p>
        </div>
        <button
          type="button"
          onClick={() => clearWhatsAppDeliveryBanner()}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-red-200 bg-white text-red-800 hover:bg-red-100"
          aria-label="Dismiss"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>,
    document.body
  );
}

/** Compact in-form copy of the same error (send dialog / technician AMC row). */
export function WhatsAppDeliveryInlineBanner({
  message,
  title,
  onDismiss,
}: {
  message: string | null;
  title?: string | null;
  onDismiss?: () => void;
}) {
  const stored = useSyncExternalStore(
    subscribe,
    getWhatsAppDeliveryBanner,
    () => null
  );
  const body = message || stored?.message || null;
  if (!body) return null;
  const heading = title || stored?.title || 'WhatsApp PDF not delivered';
  return (
    <div
      role="alert"
      className="flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-red-950"
    >
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold leading-snug">
          {heading}
        </p>
        <p className="mt-0.5 text-sm leading-snug text-red-900/90">{body}</p>
      </div>
      {onDismiss ? (
        <button
          type="button"
          onClick={onDismiss}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-red-800 hover:bg-red-100"
          aria-label="Dismiss"
        >
          <X className="h-4 w-4" />
        </button>
      ) : null}
    </div>
  );
}
