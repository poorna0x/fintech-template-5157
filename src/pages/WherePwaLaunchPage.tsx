import { Navigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { getPublicSiteKey } from '@/lib/websiteSiteKey';
import { readWherePwaToken, wherePwaPath } from '@/lib/wherePwaLaunch';

/** PWA launch with no token in the URL — restore the saved secret or show dead. */
export default function WherePwaLaunchPage() {
  const token = readWherePwaToken();
  if (token) return <Navigate to={wherePwaPath(token)} replace />;
  const isEleven = getPublicSiteKey() === 'elevenro';
  return (
    <div
      className={cn(
        'flex min-h-dvh flex-col items-center justify-center px-4 text-slate-900 antialiased',
        isEleven
          ? 'bg-[radial-gradient(120%_80%_at_50%_-10%,#ecfdf5_0%,#f8fafc_45%,#f1f5f9_100%)]'
          : 'bg-[radial-gradient(120%_80%_at_50%_-10%,#e0f2fe_0%,#f8fafc_45%,#f1f5f9_100%)]'
      )}
    >
      <div className="w-full max-w-lg overflow-hidden rounded-3xl border border-white/70 bg-white/80 p-5 shadow-[0_12px_40px_-18px_rgba(15,23,42,0.28)] backdrop-blur-sm sm:p-7">
        <div className="rounded-3xl border border-slate-200/80 bg-slate-50/90 p-8 text-center text-slate-950">
          <p className="text-4xl font-bold tracking-tight sm:text-5xl">Not available</p>
        </div>
      </div>
    </div>
  );
}
