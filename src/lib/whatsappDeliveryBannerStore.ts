/** Persistent on-screen banner for WhatsApp PDF delivery errors (not a toast). */

export type WhatsAppDeliveryBannerState = {
  title: string;
  message: string;
} | null;

let current: WhatsAppDeliveryBannerState = null;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((fn) => fn());
}

export function showWhatsAppDeliveryBanner(
  message: string,
  title = 'WhatsApp PDF not delivered'
): void {
  const text = String(message || '').trim();
  if (!text) return;
  current = { title: String(title || '').trim() || 'WhatsApp PDF not delivered', message: text };
  emit();
}

export function clearWhatsAppDeliveryBanner(): void {
  if (current == null) return;
  current = null;
  emit();
}

export function getWhatsAppDeliveryBanner(): WhatsAppDeliveryBannerState {
  return current;
}

export function subscribeWhatsAppDeliveryBanner(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
}
