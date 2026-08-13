/**
 * Bridge so incoming-call search works while AdminDashboard is unmounted
 * (e.g. /settings). Portal-level listeners stash + optionally navigate home;
 * the dashboard registers the real search handler when mounted.
 */
import { normalizePhoneForSearch } from '@/lib/utils';
import {
  markIncomingAutoSearch,
  markIncomingCallPhoneHandled,
} from '@/lib/adminSharedIncomingCall';

export type AdminIncomingCallSearchOpts = {
  offerNotFound?: boolean;
  ringAt?: number;
};

type Handler = (digits: string, opts?: AdminIncomingCallSearchOpts) => void;

let handler: Handler | null = null;
/** Phone delivered in the last few seconds — remount restore should not search twice. */
let lastLivePhone: string | null = null;
let lastLiveAt = 0;

export function setAdminIncomingCallSearchHandler(next: Handler | null): void {
  handler = next;
}

export function hasAdminIncomingCallSearchHandler(): boolean {
  return handler != null;
}

/**
 * Deliver a caller number from local APK prefs or the shared board.
 * Returns whether the dashboard handled it live (false → stash for remount / navigate).
 * Pass `preferHandler: false` while on Settings so a half-unmounted dashboard
 * handler cannot swallow the call without a visible search.
 */
export function deliverAdminIncomingCallSearch(
  digits: string,
  opts: AdminIncomingCallSearchOpts = {},
  preferHandler = true
): boolean {
  const phone = normalizePhoneForSearch(digits);
  if (phone.length < 7) return false;
  const ringAt = opts.ringAt ?? Date.now();
  markIncomingAutoSearch(phone, ringAt);
  markIncomingCallPhoneHandled(phone, ringAt);
  lastLivePhone = phone;
  lastLiveAt = Date.now();
  if (preferHandler && handler) {
    handler(phone, { ...opts, ringAt });
    return true;
  }
  return false;
}

/** True when portal already kicked off search for this phone (skip remount duplicate). */
export function wasIncomingCallJustDeliveredLive(phone: string, withinMs = 8_000): boolean {
  const digits = normalizePhoneForSearch(phone);
  if (!lastLivePhone || lastLivePhone !== digits) return false;
  return Date.now() - lastLiveAt <= withinMs;
}
