import { toast } from 'sonner';
import {
  WhatsAppInboundToast,
  WhatsAppPermissionToast,
} from '@/components/whatsapp/WhatsAppInboundToast';

const CUSTOM_TOAST_CLASS =
  '!p-0 !bg-transparent !border-0 !shadow-none !ring-0 group-[.toast]:!p-0';

export function showWhatsAppInboundToast(opts: {
  contactName: string;
  preview: string;
  onOpen: () => void;
}): void {
  toast.custom(
    (toastId) => (
      <WhatsAppInboundToast
        contactName={opts.contactName}
        preview={opts.preview}
        onOpen={() => {
          toast.dismiss(toastId);
          opts.onOpen();
        }}
        onDismiss={() => toast.dismiss(toastId)}
      />
    ),
    {
      // Stay until user taps Open or dismiss — no auto-clear.
      duration: Infinity,
      unstyled: true,
      className: CUSTOM_TOAST_CLASS,
    }
  );
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
