import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { WhatsAppLogo } from '@/components/whatsapp/WhatsAppLogo';

type WhatsAppInboundToastProps = {
  contactName: string;
  preview: string;
  onOpen: () => void;
  onDismiss: () => void;
  className?: string;
};

/** In-app alert card for new inbound WhatsApp messages (Sonner custom toast). */
export function WhatsAppInboundToast({
  contactName,
  preview,
  onOpen,
  onDismiss,
  className,
}: WhatsAppInboundToastProps) {
  const snippet =
    preview.length > 120 ? `${preview.slice(0, 117).trim()}…` : preview;

  return (
    <div
      role="alert"
      className={cn(
        'pointer-events-auto flex w-[min(calc(100vw-1.5rem),24rem)] items-center gap-3',
        'rounded-2xl border border-slate-200/90 bg-white px-3.5 py-3',
        'shadow-[0_10px_40px_-8px_rgba(15,23,42,0.18)] ring-1 ring-slate-900/[0.04]',
        'animate-in fade-in-0 slide-in-from-top-2 duration-300',
        className
      )}
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center" aria-hidden>
        <WhatsAppLogo size={32} />
      </span>

      <div className="min-w-0 flex-1 py-0.5">
        <p className="truncate text-[13px] font-semibold leading-tight text-slate-900">
          WhatsApp · {contactName}
        </p>
        <p className="mt-1 line-clamp-2 text-[13px] leading-snug text-slate-500">
          {snippet || 'New message'}
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-2 self-center">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onOpen();
          }}
          className={cn(
            'cursor-pointer rounded-lg bg-slate-800 px-3.5 py-1.5 text-[13px] font-medium text-white',
            'transition-colors duration-200 hover:bg-slate-700 active:bg-slate-900',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2'
          )}
        >
          Open
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDismiss();
          }}
          aria-label="Dismiss"
          className={cn(
            'flex h-8 w-8 cursor-pointer items-center justify-center rounded-full',
            'border border-slate-200 bg-slate-50 text-slate-500',
            'transition-colors duration-200 hover:bg-slate-100 hover:text-slate-700',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2'
          )}
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

type WhatsAppPermissionToastProps = {
  onEnable: () => void;
  onDismiss: () => void;
};

export function WhatsAppPermissionToast({ onEnable, onDismiss }: WhatsAppPermissionToastProps) {
  return (
    <div
      role="status"
      className={cn(
        'pointer-events-auto flex w-[min(calc(100vw-1.5rem),22rem)] flex-col gap-3',
        'rounded-2xl border border-slate-200/90 bg-white px-4 py-3.5',
        'shadow-[0_10px_40px_-8px_rgba(15,23,42,0.18)] ring-1 ring-slate-900/[0.04]',
        'animate-in fade-in-0 slide-in-from-top-2 duration-300'
      )}
    >
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center">
          <WhatsAppLogo size={24} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-slate-900">Desktop WhatsApp alerts</p>
          <p className="mt-0.5 text-[13px] leading-snug text-slate-500">
            Get notified when a customer messages and this tab is in the background.
          </p>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          className="flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-600"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <button
        type="button"
        onClick={onEnable}
        className={cn(
          'w-full cursor-pointer rounded-lg bg-sky-700 py-2 text-sm font-medium text-white',
          'transition-colors duration-200 hover:bg-sky-800 active:bg-sky-900'
        )}
      >
        Enable notifications
      </button>
    </div>
  );
}
