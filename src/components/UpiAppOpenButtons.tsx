/** UPI app open buttons using real brand logos from /public/upi-apps. */

type UpiAppId = 'gpay' | 'phonepe' | 'paytm' | 'bhim';

type UpiAppButtonProps = {
  id: string;
  name: string;
  href: string;
};

const LOGO_SRC: Record<UpiAppId, string> = {
  gpay: '/upi-apps/gpay.svg',
  phonepe: '/upi-apps/phonepe.svg',
  paytm: '/upi-apps/paytm.png',
  bhim: '/upi-apps/bhim.svg',
};

/** Official brand button surfaces. */
const STYLES: Record<UpiAppId, { bg: string; border: string }> = {
  gpay: { bg: '#FFFFFF', border: '#DADCE0' },
  phonepe: { bg: '#FFFFFF', border: '#E8DFF3' },
  paytm: { bg: '#FFFFFF', border: '#B3E9FA' },
  bhim: { bg: '#FFFFFF', border: '#E5E7EB' },
};

function isKnownApp(id: string): id is UpiAppId {
  return id === 'gpay' || id === 'phonepe' || id === 'paytm' || id === 'bhim';
}

export function UpiAppOpenButton({ id, name, href }: UpiAppButtonProps) {
  const style = isKnownApp(id)
    ? STYLES[id]
    : { bg: '#FFFFFF', border: '#E5E7EB' };
  const logoSrc = isKnownApp(id) ? LOGO_SRC[id] : null;

  return (
    <a
      href={href}
      aria-label={`Open ${name}`}
      className="flex h-[56px] items-center justify-center rounded-xl border px-4 shadow-sm transition hover:bg-slate-50 active:scale-[0.98]"
      style={{
        backgroundColor: style.bg,
        borderColor: style.border,
      }}
    >
      {logoSrc ? (
        <img
          src={logoSrc}
          alt={name}
          className="h-8 w-auto max-w-[150px] object-contain"
          loading="lazy"
          decoding="async"
        />
      ) : (
        <span className="text-sm font-semibold text-slate-800">{name}</span>
      )}
    </a>
  );
}

export function UpiAppOpenGrid({
  apps,
}: {
  apps: { id: string; name: string; href: string }[];
}) {
  return (
    <div className="mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
      {apps.map((app) => (
        <UpiAppOpenButton key={app.id} id={app.id} name={app.name} href={app.href} />
      ))}
    </div>
  );
}
