import { Navigate } from 'react-router-dom';
import { readWherePwaToken, wherePwaPath } from '@/lib/wherePwaLaunch';

/** PWA launch with no token in the URL — restore the saved secret or show dead. */
export default function WherePwaLaunchPage() {
  const token = readWherePwaToken();
  if (token) return <Navigate to={wherePwaPath(token)} replace />;
  return (
    <div className="flex min-h-dvh items-center justify-center bg-slate-700 px-6 text-white">
      <p className="text-center text-3xl font-bold">Not available</p>
    </div>
  );
}
