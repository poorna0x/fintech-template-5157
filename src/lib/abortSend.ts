import { toast } from 'sonner';

export const SEND_CANCELLED_MESSAGE = 'Send cancelled';
export const SEND_CANCELLED_STAFF_COPY =
  'Send cancelled — PDF was not sent to WhatsApp';
export const SEND_CANCELLED_EMAIL_COPY = 'Send cancelled — email was not sent';

export function isAbortError(err: unknown): boolean {
  if (!err) return false;
  if (typeof err === 'object') {
    const name = 'name' in err ? String((err as { name?: string }).name) : '';
    const message = 'message' in err ? String((err as { message?: string }).message) : '';
    if (name === 'AbortError') return true;
    if (/aborted|Send cancelled/i.test(message)) return true;
  }
  return false;
}

export function throwIfAborted(signal?: AbortSignal | null): void {
  if (!signal?.aborted) return;
  throw new DOMException(SEND_CANCELLED_MESSAGE, 'AbortError');
}

/** Combine a user Cancel signal with a fetch timeout. */
export function abortSignalWithTimeout(
  user: AbortSignal | undefined,
  timeoutMs: number
): AbortSignal {
  const timeout = AbortSignal.timeout(timeoutMs);
  if (!user) return timeout;
  if (typeof AbortSignal.any === 'function') {
    return AbortSignal.any([user, timeout]);
  }
  const merged = new AbortController();
  const abortMerged = () => merged.abort();
  if (user.aborted || timeout.aborted) {
    merged.abort();
    return merged.signal;
  }
  user.addEventListener('abort', abortMerged, { once: true });
  timeout.addEventListener('abort', abortMerged, { once: true });
  return merged.signal;
}

export function toastSendCancelled(
  toastId?: string | number,
  channel: 'whatsapp' | 'email' = 'whatsapp'
): void {
  toast.info(channel === 'email' ? SEND_CANCELLED_EMAIL_COPY : SEND_CANCELLED_STAFF_COPY, {
    id: toastId,
  });
}

export function toastIfAborted(
  err: unknown,
  toastId?: string | number,
  channel: 'whatsapp' | 'email' = 'whatsapp'
): boolean {
  if (!isAbortError(err)) return false;
  toastSendCancelled(toastId, channel);
  return true;
}

/** True when the user cancelled before any number was accepted by Meta. */
export function toastIfCancelledBeforeSend(
  cancelled: boolean | undefined,
  sent: number,
  toastId?: string | number
): boolean {
  if (!cancelled || sent > 0) return false;
  toastSendCancelled(toastId);
  return true;
}
