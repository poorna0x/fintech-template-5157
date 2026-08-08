import { AlertCircle, Check, CheckCheck, Clock, User } from 'lucide-react';
import { cn } from '@/lib/utils';
import { isFailedDeliveryStatus } from '@/lib/whatsappInbox';

/** WhatsApp-style delivery ticks for outbound messages. */
export function WhatsAppTicks({
  status,
  failed,
  className,
}: {
  status?: string | null;
  failed?: boolean;
  className?: string;
}) {
  const s = String(status || '').toLowerCase();
  if (failed || isFailedDeliveryStatus(s)) {
    return <AlertCircle className={cn('h-3.5 w-3.5 text-red-500', className)} aria-label="Failed" />;
  }
  if (s === 'read') {
    return <CheckCheck className={cn('h-3.5 w-3.5 text-[#53bdeb]', className)} aria-label="Read" />;
  }
  if (s === 'delivered') {
    return <CheckCheck className={cn('h-3.5 w-3.5 text-[#667781]', className)} aria-label="Delivered" />;
  }
  if (s === 'sent' || s === 'accepted') {
    return <Check className={cn('h-3.5 w-3.5 text-[#667781]', className)} aria-label="Sent" />;
  }
  return <Clock className={cn('h-3 w-3 text-[#667781]', className)} aria-label="Pending" />;
}

function isPhoneLike(value: string): boolean {
  const digits = value.replace(/\D/g, '');
  return digits.length >= 8 && digits.length / Math.max(value.replace(/\s/g, '').length, 1) > 0.7;
}

/** Initials from a real name only (never from phone digits). */
export function whatsappAvatarInitials(name: string | null | undefined): string | null {
  const raw = String(name || '').trim();
  if (!raw || isPhoneLike(raw)) return null;
  const parts = raw.replace(/^\+/, '').split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    const a = parts[0][0] || '';
    const b = parts[1][0] || '';
    return `${a}${b}`.toUpperCase();
  }
  if (parts[0] && /[a-zA-Z]/.test(parts[0])) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  return null;
}

/** Default: human profile icon. Initials only when a CRM name exists. */
export function WhatsAppAvatar({
  name,
  /** @deprecated use `name` — phone labels must not become avatar digits */
  label,
  size = 'md',
  className,
}: {
  name?: string | null;
  label?: string | null;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  const dim =
    size === 'lg' ? 'h-12 w-12' : size === 'sm' ? 'h-9 w-9' : 'h-11 w-11';
  const icon =
    size === 'lg' ? 'h-7 w-7' : size === 'sm' ? 'h-5 w-5' : 'h-6 w-6';
  const text = size === 'lg' ? 'text-base' : size === 'sm' ? 'text-xs' : 'text-sm';
  const initials = whatsappAvatarInitials(name || label);

  return (
    <div
      className={cn(
        'flex shrink-0 items-center justify-center rounded-full bg-[#dfe5e7] font-semibold text-[#54656f]',
        dim,
        initials ? text : null,
        className
      )}
      aria-hidden
    >
      {initials ? initials : <User className={cn(icon, 'text-[#8696a0]')} strokeWidth={1.75} />}
    </div>
  );
}
