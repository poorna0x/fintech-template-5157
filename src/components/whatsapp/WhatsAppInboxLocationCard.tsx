import { MapPin } from 'lucide-react';
import { extractMapsUrlFromText } from '@/lib/googleMapsLink';
import { parseLatLngFromWhatsAppLocationBody } from '@/lib/whatsappInboxApplyToCustomer';
import { formatAdminWhatsAppBody } from '@/lib/whatsappInbox';

export function WhatsAppInboxLocationCard({ body }: { body: string | null | undefined }) {
  const raw = String(body || '');
  const coords = parseLatLngFromWhatsAppLocationBody(raw);
  const mapsUrl = extractMapsUrlFromText(raw);
  const href = coords
    ? `https://www.google.com/maps?q=${coords.lat},${coords.lng}`
    : mapsUrl;

  let label = formatAdminWhatsAppBody(raw, { compact: false }).trim();
  if (coords) {
    label = label.replace(/-?\d+(?:\.\d+)?\s*,\s*-?\d+(?:\.\d+)?/, '').trim();
  }
  if (mapsUrl) {
    label = label.replace(mapsUrl, '').trim();
  }
  if (!label) {
    label = coords
      ? `${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}`
      : 'Location';
  }

  const inner = (
    <div className="mb-1 flex min-w-[200px] max-w-[260px] items-start gap-2 rounded-md bg-black/20 px-2 py-2 pr-8">
      <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-emerald-500/20 text-emerald-300">
        <MapPin className="h-4 w-4" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-[#e9edef]">Location</span>
        <span className="block truncate text-[12px] leading-[16px] text-[#8696a0]">{label}</span>
        {href ? (
          <span className="mt-0.5 block text-[11px] font-medium text-sky-300">Open in Maps</span>
        ) : null}
      </span>
    </div>
  );

  if (!href) return inner;

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="block cursor-pointer"
      onClick={(e) => e.stopPropagation()}
    >
      {inner}
    </a>
  );
}
