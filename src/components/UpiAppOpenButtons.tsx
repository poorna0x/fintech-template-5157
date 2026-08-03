/** Branded UPI app open buttons (logos + official-ish colors). */

type UpiAppId = 'gpay' | 'phonepe' | 'paytm' | 'bhim';

type UpiAppButtonProps = {
  id: string;
  name: string;
  href: string;
};

const STYLES: Record<
  UpiAppId,
  { bg: string; border: string; text: string; logoBg: string }
> = {
  gpay: {
    bg: '#FFFFFF',
    border: '#DADCE0',
    text: '#3C4043',
    logoBg: '#FFFFFF',
  },
  phonepe: {
    bg: '#5F259F',
    border: '#5F259F',
    text: '#FFFFFF',
    logoBg: '#FFFFFF',
  },
  paytm: {
    bg: '#00BAF2',
    border: '#00BAF2',
    text: '#FFFFFF',
    logoBg: '#FFFFFF',
  },
  bhim: {
    bg: '#FFFFFF',
    border: '#E5E7EB',
    text: '#111827',
    logoBg: '#FFF7ED',
  },
};

function GPayLogo({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 48 48" aria-hidden>
      <path
        fill="#4285F4"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#34A853"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#EA4335"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  );
}

function PhonePeLogo({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 48 48" aria-hidden>
      <rect width="48" height="48" rx="12" fill="#5F259F" />
      <path
        fill="#FFFFFF"
        d="M14.5 12.5h8.2c4.9 0 8.3 2.9 8.3 7.4 0 4.6-3.5 7.5-8.5 7.5h-4.5V35h-3.5V12.5zm3.5 11.4h4.4c2.8 0 4.6-1.5 4.6-3.9s-1.8-3.9-4.6-3.9H18v7.8z"
      />
      <circle cx="34.5" cy="33.5" r="3.2" fill="#00B8F5" />
    </svg>
  );
}

function PaytmLogo({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 48 48" aria-hidden>
      <rect width="48" height="48" rx="12" fill="#012B72" />
      <text
        x="24"
        y="30"
        textAnchor="middle"
        fill="#00BAF2"
        fontFamily="Arial, Helvetica, sans-serif"
        fontSize="14"
        fontWeight="800"
      >
        paytm
      </text>
    </svg>
  );
}

function BhimLogo({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 48 48" aria-hidden>
      <rect width="48" height="48" rx="12" fill="#FFFFFF" stroke="#E5E7EB" />
      <path fill="#F7931E" d="M10 14h28v5.5H10V14zm0 14.5h28V34H10v-5.5z" />
      <path
        fill="#0B5CAB"
        d="M14 22.5h20c0 3.6-4.5 6.5-10 6.5s-10-2.9-10-6.5z"
      />
      <text
        x="24"
        y="21.5"
        textAnchor="middle"
        fill="#0B5CAB"
        fontFamily="Arial, Helvetica, sans-serif"
        fontSize="9"
        fontWeight="800"
      >
        BHIM
      </text>
    </svg>
  );
}

function AppLogo({ id, className }: { id: UpiAppId; className?: string }) {
  switch (id) {
    case 'gpay':
      return <GPayLogo className={className} />;
    case 'phonepe':
      return <PhonePeLogo className={className} />;
    case 'paytm':
      return <PaytmLogo className={className} />;
    case 'bhim':
      return <BhimLogo className={className} />;
    default:
      return null;
  }
}

function isKnownApp(id: string): id is UpiAppId {
  return id === 'gpay' || id === 'phonepe' || id === 'paytm' || id === 'bhim';
}

export function UpiAppOpenButton({ id, name, href }: UpiAppButtonProps) {
  const style = isKnownApp(id)
    ? STYLES[id]
    : { bg: '#1A73E8', border: '#1A73E8', text: '#FFFFFF', logoBg: '#FFFFFF' };

  return (
    <a
      href={href}
      className="flex items-center gap-3 rounded-xl border px-3 py-3 text-sm font-semibold shadow-sm transition hover:opacity-95 active:scale-[0.98]"
      style={{
        backgroundColor: style.bg,
        borderColor: style.border,
        color: style.text,
      }}
    >
      <span
        className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl"
        style={{ backgroundColor: style.logoBg }}
      >
        {isKnownApp(id) ? <AppLogo id={id} className="h-10 w-10" /> : null}
      </span>
      <span className="min-w-0 leading-tight">{name}</span>
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
