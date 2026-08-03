import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Bug, ChevronDown, ChevronUp, MapPin, Timer } from 'lucide-react';
import {
  formatRemaining,
  getAutoAskOtpDebugSnapshot,
  subscribeAutoAskOtpDebug,
  type AutoAskOtpDebugSnapshot,
} from '@/lib/autoAskOtpDebug';
import { AUTO_ASK_OTP_NEAR_METERS } from '@/lib/autoAskOtpOnSite';

const STORAGE_KEY = 'hro_auto_otp_debug_open';

/**
 * Live Auto Ask OTP diagnostics on the technician home page.
 * Shows near/far, dwell countdown, and last server replies.
 */
const TechnicianAutoAskOtpDebugCard = () => {
  const [snap, setSnap] = useState<AutoAskOtpDebugSnapshot>(() =>
    getAutoAskOtpDebugSnapshot()
  );
  const [open, setOpen] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) === '1';
    } catch {
      return true;
    }
  });
  const [, setTick] = useState(0);

  useEffect(() => subscribeAutoAskOtpDebug(setSnap), []);

  // Refresh countdown display every second while a timer is running.
  useEffect(() => {
    const hasTimer = snap.jobs.some(
      (j) => j.lastServer?.waiting && (j.lastServer.remainingMs || 0) > 0
    );
    if (!hasTimer || !open) return;
    const id = window.setInterval(() => setTick((n) => n + 1), 1000);
    return () => window.clearInterval(id);
  }, [snap.jobs, open]);

  const toggle = () => {
    setOpen((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(STORAGE_KEY, next ? '1' : '0');
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  const otpJobs = snap.jobs.filter((j) => j.requireOtp);
  if (otpJobs.length === 0 && snap.recentLog.length === 0) return null;

  const remainingLive = (remainingMs?: number, at?: string) => {
    if (remainingMs == null || !at) return remainingMs;
    const elapsed = Date.now() - new Date(at).getTime();
    return Math.max(0, remainingMs - elapsed);
  };

  return (
    <Card className="mb-6 border-violet-200 bg-violet-50/80 dark:bg-violet-950/20 dark:border-violet-800">
      <CardHeader className="py-3 px-4">
        <button
          type="button"
          onClick={toggle}
          className="flex w-full items-center justify-between text-left"
        >
          <CardTitle className="flex items-center gap-2 text-base text-violet-900 dark:text-violet-100">
            <Bug className="h-4 w-4" />
            Auto OTP debug
          </CardTitle>
          {open ? (
            <ChevronUp className="h-4 w-4 text-violet-700" />
          ) : (
            <ChevronDown className="h-4 w-4 text-violet-700" />
          )}
        </button>
      </CardHeader>
      {open && (
        <CardContent className="px-4 pb-4 pt-0 space-y-3 text-sm">
          <div className="grid grid-cols-1 gap-1 text-violet-900 dark:text-violet-100 sm:grid-cols-2">
            <p>
              Location tracking:{' '}
              <strong>{snap.locationTrackingEnabled ? 'ON' : 'OFF'}</strong>
            </p>
            <p>
              Native APK:{' '}
              <strong>{snap.nativePlatform ? 'yes' : 'no (web)'}</strong>
            </p>
            <p className="flex items-center gap-1">
              <MapPin className="h-3.5 w-3.5" />
              Tech GPS:{' '}
              {snap.techLat != null && snap.techLng != null
                ? `${snap.techLat.toFixed(5)}, ${snap.techLng.toFixed(5)}`
                : 'none yet'}
            </p>
            <p>
              Accuracy:{' '}
              {snap.accuracyMeters != null
                ? `${Math.round(snap.accuracyMeters)}m${
                    snap.accuracyOk === false ? ' (too coarse)' : ''
                  }`
                : '—'}
            </p>
            <p>Near limit: {AUTO_ASK_OTP_NEAR_METERS}m</p>
            <p>
              Last evaluate:{' '}
              {snap.lastEvaluateAt
                ? new Date(snap.lastEvaluateAt).toLocaleTimeString()
                : '—'}
            </p>
            <p>
              Last flush:{' '}
              {snap.lastFlushAt
                ? new Date(snap.lastFlushAt).toLocaleTimeString()
                : '—'}
            </p>
          </div>

          <div className="space-y-2">
            {otpJobs.map((job) => {
              const liveLeft = remainingLive(
                job.lastServer?.remainingMs,
                job.lastServer?.at
              );
              const nearLabel =
                job.isNear === true
                  ? 'AT CUSTOMER (near)'
                  : job.isNear === false
                    ? 'NOT near'
                    : 'distance unknown';
              return (
                <div
                  key={job.jobId}
                  className="rounded-lg border border-violet-200 bg-white/80 p-3 dark:bg-violet-950/40 dark:border-violet-800"
                >
                  <p className="font-semibold text-violet-950 dark:text-violet-50">
                    {job.customerName || 'Customer'}
                    {job.jobNumber ? ` · #${job.jobNumber}` : ''}
                  </p>
                  <p className="text-xs text-violet-700 dark:text-violet-300">
                    {job.status || '—'} ·{' '}
                    {job.otpEntered
                      ? 'OTP already entered'
                      : job.requireOtp
                        ? 'OTP required'
                        : 'no OTP'}
                  </p>
                  <p className="mt-1">
                    Distance:{' '}
                    <strong>
                      {job.meters != null ? `${job.meters}m` : '—'}
                    </strong>{' '}
                    → <strong>{nearLabel}</strong>
                  </p>
                  {!job.hasCustomerCoords && (
                    <p className="text-red-600">No customer map pin / coords</p>
                  )}
                  {job.skipReason && (
                    <p className="text-amber-700">Skip: {job.skipReason}</p>
                  )}
                  {job.lastServer && (
                    <div className="mt-2 rounded bg-violet-100/80 p-2 text-xs dark:bg-violet-900/40">
                      <p className="flex items-center gap-1 font-medium">
                        <Timer className="h-3.5 w-3.5" />
                        Last server ({job.lastServer.near ? 'near' : 'check'})
                      </p>
                      <p>HTTP {job.lastServer.httpStatus}</p>
                      {job.lastServer.waiting && (
                        <p className="text-emerald-700 dark:text-emerald-300 font-semibold">
                          Timer running — {formatRemaining(liveLeft)} left
                          (then Ask OTP)
                        </p>
                      )}
                      {job.lastServer.asked && (
                        <p>
                          Asked OTP · push sent:{' '}
                          {job.lastServer.sent ? 'yes' : 'no'}
                        </p>
                      )}
                      {job.lastServer.skipped && (
                        <p>Skipped: {job.lastServer.reason || '—'}</p>
                      )}
                      {job.lastServer.error && (
                        <p className="text-red-600">{job.lastServer.error}</p>
                      )}
                      {job.lastServer.onsiteDetectedAt && (
                        <p>
                          On-site since:{' '}
                          {new Date(
                            job.lastServer.onsiteDetectedAt
                          ).toLocaleTimeString()}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {snap.recentLog.length > 0 && (
            <div>
              <p className="mb-1 font-medium text-violet-900 dark:text-violet-100">
                Recent log
              </p>
              <ul className="max-h-40 overflow-y-auto rounded border border-violet-200 bg-white/70 p-2 font-mono text-[11px] leading-relaxed text-violet-950 dark:bg-violet-950/50 dark:text-violet-100 dark:border-violet-800">
                {snap.recentLog.map((line, i) => (
                  <li key={`${i}-${line.slice(0, 24)}`}>{line}</li>
                ))}
              </ul>
            </div>
          )}

          <Button
            type="button"
            size="sm"
            variant="outline"
            className="border-violet-300 text-violet-800"
            onClick={toggle}
          >
            Hide debug
          </Button>
        </CardContent>
      )}
    </Card>
  );
};

export default TechnicianAutoAskOtpDebugCard;
