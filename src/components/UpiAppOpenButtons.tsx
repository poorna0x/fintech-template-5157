/** UPI app open buttons using real brand logos from /public/upi-apps. */

type UpiAppId = 'gpay' | 'phonepe' | 'paytm';

type UpiAppButtonProps = {
  id: string;
  name: string;
  href: string;
};

const LOGO_SRC: Record<UpiAppId, string> = {
  gpay: '/upi-apps/gpay.svg',
  phonepe: '/upi-apps/phonepe.svg',
  paytm: '/upi-apps/paytm.png',
};

/** Small square app icons for the Open UPI app button. */
const ICON_SRC: Record<UpiAppId, string> = {
  gpay: '/upi-apps/icons/gpay.png',
  phonepe: '/upi-apps/icons/phonepe.png',
  paytm: '/upi-apps/icons/paytm.png',
};

const MINI_APPS: { id: UpiAppId; name: string }[] = [
  { id: 'gpay', name: 'GPay' },
  { id: 'phonepe', name: 'PhonePe' },
  { id: 'paytm', name: 'Paytm' },
];

/** Official brand button surfaces. */
const STYLES: Record<UpiAppId, { bg: string; border: string }> = {
  gpay: { bg: '#FFFFFF', border: '#DADCE0' },
  phonepe: { bg: '#FFFFFF', border: '#E8DFF3' },
  paytm: { bg: '#FFFFFF', border: '#B3E9FA' },
};

function isKnownApp(id: string): id is UpiAppId {
  return id === 'gpay' || id === 'phonepe' || id === 'paytm';
}

/** Tiny brand icons shown on the main Open UPI app CTA (soft, low-contrast). */
export function UpiAppMiniLogoRow({ className = '' }: { className?: string }) {
  return (
    <span className={`inline-flex items-center -space-x-1.5 ${className}`} aria-hidden>
      {MINI_APPS.map((app) => (
        <span
          key={app.id}
          className="flex h-7 w-7 items-center justify-center overflow-hidden rounded-full border border-slate-200/80 bg-slate-50"
          title={app.name}
        >
          <img
            src={ICON_SRC[app.id]}
            alt=""
            className="h-[15px] w-[15px] object-contain opacity-90"
            loading="lazy"
            decoding="async"
          />
        </span>
      ))}
    </span>
  );
}

/** Soft primary CTA — avoids harsh white-on-blue logo contrast. */
export function UpiOpenAppCta({ href }: { href: string }) {
  return (
    <a
      href={href}
      className="flex w-full items-center justify-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3.5 text-base font-semibold text-slate-800 shadow-sm transition hover:bg-slate-50 active:scale-[0.99]"
    >
      <UpiAppMiniLogoRow />
      <span>Open UPI app</span>
    </a>
  );
}

export function UpiAppOpenButton({ id, name, href }: UpiAppButtonProps) {
  const style = isKnownApp(id)
    ? STYLES[id]
    : { bg: '#FFFFFF', border: '#E5E7EB' };
  const logoSrc = isKnownApp(id) ? LOGO_SRC[id] : null;
  const iconSrc = isKnownApp(id) ? ICON_SRC[id] : null;

  return (
    <a
      href={href}
      aria-label={`Open ${name}`}
      className="flex min-w-0 flex-col items-center justify-center gap-1.5 rounded-xl border px-1.5 py-2.5 shadow-sm transition hover:bg-slate-50 active:scale-[0.98]"
      style={{
        backgroundColor: style.bg,
        borderColor: style.border,
      }}
    >
      {iconSrc ? (
        <img
          src={iconSrc}
          alt=""
          className="h-8 w-8 object-contain"
          loading="lazy"
          decoding="async"
        />
      ) : logoSrc ? (
        <img
          src={logoSrc}
          alt={name}
          className="h-7 w-auto max-w-full object-contain"
          loading="lazy"
          decoding="async"
        />
      ) : null}
      <span className="truncate text-[11px] font-semibold leading-none text-slate-800">{name}</span>
    </a>
  );
}

export function UpiAppOpenGrid({
  apps,
}: {
  apps: { id: string; name: string; href: string }[];
}) {
  return (
    <div className="mt-3 grid grid-cols-3 gap-2">
      {apps.map((app) => (
        <UpiAppOpenButton key={app.id} id={app.id} name={app.name} href={app.href} />
      ))}
    </div>
  );
}
