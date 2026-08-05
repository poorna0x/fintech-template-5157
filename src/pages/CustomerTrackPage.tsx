import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Droplets, Loader2, MapPin, Phone, User } from 'lucide-react';
import { getDocumentBrandLabel, normalizeDocumentBrand, type DocumentBrand } from '@/lib/service-brands';
import {
  agoLabel,
  fetchCustomerTrackSnapshot,
  type CustomerTrackSnapshot,
} from '@/lib/jobTrackLink';

const POLL_MS = 60_000;

function defaultBrandFromHost(): DocumentBrand {
  if (typeof window === 'undefined') return 'hydrogenro';
  return /elevenro/i.test(window.location.hostname) ? 'elevenro' : 'hydrogenro';
}

function PayBrandMark({ brand }: { brand: DocumentBrand }) {
  const name = brand === 'elevenro' ? 'ElevenRO' : 'Hydrogen RO';
  return (
    <div className="flex items-center justify-center gap-2">
      <div className="relative z-10 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-sky-500 to-cyan-500 shadow-sm">
        <Droplets className="h-5 w-5 text-white" />
      </div>
      <div className="text-xl font-bold text-slate-900">{name}</div>
    </div>
  );
}

const TrackMap = ({
  latitude,
  longitude,
}: {
  latitude: number;
  longitude: number;
}) => {
  const src = `https://maps.google.com/maps?q=${latitude},${longitude}&z=15&output=embed`;
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200">
      <iframe
        title="Technician location"
        src={src}
        className="h-56 w-full sm:h-64"
        loading="lazy"
        referrerPolicy="no-referrer-when-downgrade"
      />
    </div>
  );
};

const CustomerTrackPage = () => {
  const { code: codeParam } = useParams<{ code?: string }>();
  const code = String(codeParam || '')
    .trim()
    .replace(/[^a-zA-Z0-9]/g, '');

  const [snapshot, setSnapshot] = useState<CustomerTrackSnapshot | null>(null);
  const [loading, setLoading] = useState(true);

  const brand: DocumentBrand =
    normalizeDocumentBrand(snapshot?.brand) || defaultBrandFromHost();
  const brandLabel = getDocumentBrandLabel(brand);

  const loadSnapshot = useCallback(async () => {
    if (code.length < 6) {
      setSnapshot({ ok: false, phase: 'invalid' });
      setLoading(false);
      return;
    }
    const data = await fetchCustomerTrackSnapshot(code);
    setSnapshot(data);
    setLoading(false);
  }, [code]);

  useEffect(() => {
    document.title = `Track technician | ${brandLabel}`;
  }, [brandLabel]);

  useEffect(() => {
    setLoading(true);
    void loadSnapshot();
  }, [loadSnapshot]);

  useEffect(() => {
    if (code.length < 6) return;
    let timer: ReturnType<typeof setInterval> | null = null;

    const tick = () => {
      if (typeof document !== 'undefined' && document.hidden) return;
      void loadSnapshot();
    };

    timer = setInterval(tick, POLL_MS);

    const onVisibility = () => {
      if (!document.hidden) void loadSnapshot();
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      if (timer) clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [code, loadSnapshot]);

  const showMap =
    snapshot?.latitude != null &&
    snapshot?.longitude != null &&
    (snapshot.phase === 'en_route' || snapshot.phase === 'working_away');

  const locationAgo = useMemo(
    () => agoLabel(snapshot?.fixTime || snapshot?.locationUpdatedAt),
    [snapshot?.fixTime, snapshot?.locationUpdatedAt]
  );

  const shellClass =
    'min-h-[100dvh] bg-gradient-to-b from-sky-50 via-white to-slate-50 px-4 py-5 font-sans text-slate-900 sm:py-8';

  if (loading && !snapshot) {
    return (
      <div className={shellClass}>
        <div className="mx-auto flex max-w-md flex-col items-center pt-16">
          <PayBrandMark brand={defaultBrandFromHost()} />
          <Loader2 className="mt-8 h-8 w-8 animate-spin text-sky-600" />
          <p className="mt-3 text-sm text-slate-600">Loading…</p>
        </div>
      </div>
    );
  }

  const phase = snapshot?.phase || 'error';

  return (
    <div className={shellClass}>
      <div className="mx-auto w-full max-w-md">
        <PayBrandMark brand={brand} />

        <div className="mt-4 text-center">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-sky-700">
            Technician tracking
          </p>
          <h1 className="mt-1 text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">
            {brandLabel}
          </h1>
        </div>

        {phase === 'invalid' || phase === 'expired' ? (
          <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 text-center shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">Link unavailable</h2>
            <p className="mt-2 text-sm text-slate-600">
              This tracking link has expired or is invalid. Contact {brandLabel} for help.
            </p>
          </div>
        ) : null}

        {phase === 'not_started' ? (
          <div className="mt-6 rounded-2xl border border-amber-200/80 bg-amber-50 p-5 text-center shadow-sm">
            <MapPin className="mx-auto h-8 w-8 text-amber-600" />
            <h2 className="mt-3 text-lg font-semibold text-amber-950">Not started yet</h2>
            <p className="mt-2 text-sm leading-relaxed text-amber-900">
              The technician has not started for your job yet. This page will update when they are
              on the way — you can check back in a few minutes.
            </p>
          </div>
        ) : null}

        {phase === 'completed' ? (
          <div className="mt-6 rounded-2xl border border-emerald-200/80 bg-emerald-50 p-5 text-center shadow-sm">
            <h2 className="text-lg font-semibold text-emerald-950">Service completed</h2>
            <p className="mt-2 text-sm text-emerald-900">Thank you for choosing {brandLabel}.</p>
          </div>
        ) : null}

        {(phase === 'en_route' || phase === 'arrived' || phase === 'working_away') && snapshot ? (
          <div className="mt-4 space-y-3">
            <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm">
              <div className="flex items-start gap-3">
                <User className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] text-slate-500">Technician</p>
                  <p className="text-sm font-semibold text-slate-900">
                    {snapshot.techName || 'Technician'}
                  </p>
                </div>
              </div>
              {snapshot.techPhone ? (
                <div className="mt-3 flex items-start gap-3 border-t border-slate-100 pt-3">
                  <Phone className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] text-slate-500">Phone</p>
                    <a
                      href={`tel:${snapshot.techPhone}`}
                      className="text-sm font-semibold text-sky-700 hover:underline"
                    >
                      {snapshot.techPhone}
                    </a>
                  </div>
                </div>
              ) : null}
            </div>

            {phase === 'arrived' ? (
              <div className="rounded-2xl border border-emerald-200/80 bg-emerald-50 px-4 py-3 text-center">
                <p className="text-sm font-semibold text-emerald-950">Technician has arrived</p>
                <p className="mt-1 text-xs text-emerald-800">
                  They are at your location and working on your service.
                </p>
              </div>
            ) : null}

            {phase === 'working_away' ? (
              <div className="rounded-2xl border border-sky-200/80 bg-sky-50 px-4 py-3 text-center">
                <p className="text-sm font-semibold text-sky-950">Service in progress</p>
                <p className="mt-1 text-xs text-sky-800">
                  Your technician is working on your service.
                </p>
              </div>
            ) : null}

            {phase === 'en_route' ? (
              <div className="rounded-2xl border border-sky-200/80 bg-sky-50 px-4 py-3 text-center">
                <p className="text-sm font-semibold text-sky-950">On the way</p>
                {snapshot.estimatedArrival ? (
                  <p className="mt-1 text-xs text-sky-800">
                    Estimated arrival{' '}
                    <span className="font-semibold">{snapshot.estimatedArrival}</span>
                    {snapshot.durationText ? ` (${snapshot.durationText} away)` : ''}
                  </p>
                ) : (
                  <p className="mt-1 text-xs text-sky-800">Your technician is heading to you.</p>
                )}
              </div>
            ) : null}

            {showMap && snapshot.latitude != null && snapshot.longitude != null ? (
              <div className="rounded-2xl border border-slate-200/80 bg-white p-3 shadow-sm">
                <p className="text-center text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  {phase === 'en_route' ? 'Live location' : 'Last known location'}
                </p>
                <div className="mt-2">
                  <TrackMap latitude={snapshot.latitude} longitude={snapshot.longitude} />
                </div>
                {locationAgo ? (
                  <p className="mt-2 text-center text-[11px] text-slate-500">
                    Updated {locationAgo}
                  </p>
                ) : null}
              </div>
            ) : (
              <div className="rounded-2xl border border-slate-200 bg-white p-4 text-center text-sm text-slate-600">
                Location not available yet — check back shortly.
              </div>
            )}
          </div>
        ) : null}

        {phase === 'error' ? (
          <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 text-center shadow-sm">
            <p className="text-sm text-slate-600">Could not load tracking. Please try again.</p>
          </div>
        ) : null}

        <p className="mt-6 text-center text-[11px] leading-relaxed text-slate-400">
          Updates about once a minute while this page is open. Secured tracking for {brandLabel}.
        </p>
      </div>
    </div>
  );
};

export default CustomerTrackPage;
