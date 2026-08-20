import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Home, Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import TurnstileWidget, { isTurnstileEnabled } from '@/components/TurnstileWidget';
import {
  fetchPublicTechOfficeStatus,
  type PublicTechOfficeStatus,
} from '@/lib/techOfficeStatus';
import { cn } from '@/lib/utils';
import { saveWherePwaToken } from '@/lib/wherePwaLaunch';
import { getPublicSiteKey } from '@/lib/websiteSiteKey';
import {
  getInstallPromptEvent,
  isPWAMode,
  registerWherePWA,
  type BeforeInstallPromptEvent,
} from '@/lib/pwa';

const POLL_MS = 2_000;
const POLL_MAX_MS = 42_000;
const AUTO_REFRESH_MS = 3 * 60_000;
const CACHE_PREFIX = 'hro_where_last_v1:';
const THEME_COLOR = '#f8fafc';

function cacheKey(token: string) {
  return `${CACHE_PREFIX}${token}`;
}

function readCache(token: string): PublicTechOfficeStatus | null {
  try {
    const raw = sessionStorage.getItem(cacheKey(token));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PublicTechOfficeStatus;
    if (!parsed || parsed.ok !== true) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeCache(token: string, data: PublicTechOfficeStatus) {
  try {
    sessionStorage.setItem(cacheKey(token), JSON.stringify(data));
  } catch {
    /* ignore */
  }
}

function checkedLabel(iso: string) {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return '';
  return new Date(t).toLocaleTimeString('en-IN', {
    hour: 'numeric',
    minute: '2-digit',
  });
}

function screenFor(
  data: PublicTechOfficeStatus | null,
  phase: 'loading' | 'ready' | 'missing' | 'bot',
  waitTimedOut: boolean,
  tapBusy: boolean
) {
  if (phase === 'missing') {
    return {
      page: 'bg-[radial-gradient(120%_80%_at_50%_-10%,#e2e8f0_0%,#f8fafc_45%,#f1f5f9_100%)]',
      card: 'border-slate-200/80 bg-slate-50/90 text-slate-950',
      title: 'Not available',
      sub: '',
      checking: false,
    };
  }
  if (phase === 'bot') {
    return {
      page: 'bg-[radial-gradient(120%_80%_at_50%_-10%,#e0f2fe_0%,#f8fafc_45%,#f1f5f9_100%)]',
      card: 'border-slate-200/80 bg-white/90 text-slate-950',
      title: 'Please wait',
      sub: 'Security check',
      checking: false,
    };
  }
  const stillChecking =
    !waitTimedOut &&
    (tapBusy || !data || phase === 'loading' || data.status === 'checking');
  if (stillChecking) {
    return {
      page: 'bg-[radial-gradient(120%_80%_at_50%_-10%,#d1fae5_0%,#ecfdf5_40%,#f0fdf4_100%)]',
      card: 'border-slate-200/80 bg-white/90 text-slate-950',
      title: 'Checking…',
      sub: data?.firstName ? `Looking for ${data.firstName}` : '',
      checking: true,
    };
  }
  if (data?.status === 'in_office') {
    return {
      page: 'bg-[radial-gradient(120%_80%_at_50%_-10%,#a7f3d0_0%,#d1fae5_38%,#ecfdf5_100%)]',
      card: 'border-emerald-200/80 bg-emerald-50/90 text-emerald-950',
      title: 'In office',
      sub: data.live
        ? 'Now'
        : data.checkedAt
          ? `Last seen ${checkedLabel(data.checkedAt)}`
          : '',
      checking: false,
    };
  }
  if (data?.status === 'en_route' && data.etaMinutes) {
    return {
      page: 'bg-[radial-gradient(120%_80%_at_50%_-10%,#fde68a_0%,#fef3c7_40%,#fffbeb_100%)]',
      card: 'border-amber-200/80 bg-amber-50/90 text-amber-950',
      title: `${data.etaMinutes} min`,
      sub: 'to office',
      checking: false,
    };
  }
  return {
    page: 'bg-[radial-gradient(120%_80%_at_50%_-10%,#e2e8f0_0%,#f8fafc_45%,#f1f5f9_100%)]',
    card: 'border-slate-200/80 bg-slate-50/90 text-slate-950',
    title: 'Can’t get travel time',
    sub: data?.checkedAt ? `Checked ${checkedLabel(data.checkedAt)}` : '',
    checking: false,
  };
}

export default function PublicTechOfficeStatusPage() {
  const { token = '' } = useParams<{ token: string }>();
  const isEleven = getPublicSiteKey() === 'elevenro';
  const [data, setData] = useState<PublicTechOfficeStatus | null>(() =>
    token ? readCache(token) : null
  );
  const [phase, setPhase] = useState<'loading' | 'ready' | 'missing' | 'bot'>('loading');
  const [turnstileToken, setTurnstileToken] = useState('');
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIosHint, setShowIosHint] = useState(false);
  const [waitTimedOut, setWaitTimedOut] = useState(false);
  const [tapBusy, setTapBusy] = useState(false);
  const pollUntilRef = useRef(0);
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refreshingRef = useRef(false);
  const dataRef = useRef(data);
  const phaseRef = useRef(phase);
  dataRef.current = data;
  phaseRef.current = phase;

  useEffect(() => {
    if (token) saveWherePwaToken(token);
    void registerWherePWA();
    const theme = document.querySelector('meta[name="theme-color"]');
    if (theme) theme.setAttribute('content', THEME_COLOR);
  }, [token]);

  useEffect(() => {
    if (isPWAMode()) return;
    void getInstallPromptEvent().then((ev) => {
      if (ev) setInstallEvent(ev);
      else {
        const ua = navigator.userAgent || '';
        const ios = /iPad|iPhone|iPod/.test(ua);
        if (ios) setShowIosHint(true);
      }
    });
  }, []);

  const load = useCallback(
    async (opts?: { poll?: boolean; refresh?: boolean }) => {
      if (!token) {
        setPhase('missing');
        setTapBusy(false);
        return;
      }
      if (phaseRef.current === 'bot' && isTurnstileEnabled() && !turnstileToken) {
        return;
      }
      if (refreshingRef.current) return;
      refreshingRef.current = true;
      const result = await fetchPublicTechOfficeStatus(
        token,
        turnstileToken || undefined,
        opts?.refresh ? { refresh: true } : opts?.poll ? { poll: true } : undefined
      );
      refreshingRef.current = false;
      if (result.ok === false) {
        setTapBusy(false);
        if (result.error === 'not_found') {
          setData(null);
          setPhase('missing');
          return;
        }
        if (result.error === 'bot') {
          setPhase('bot');
          return;
        }
        setPhase(dataRef.current ? 'ready' : 'loading');
        return;
      }
      setData(result);
      writeCache(token, result);
      setPhase('ready');
      if (result.pending || result.status === 'checking') {
        if (!pollUntilRef.current) pollUntilRef.current = Date.now() + POLL_MAX_MS;
        if (Date.now() < pollUntilRef.current) {
          if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
          pollTimerRef.current = setTimeout(() => {
            void load({ poll: true });
          }, POLL_MS);
        } else {
          setWaitTimedOut(true);
          setTapBusy(false);
        }
      } else {
        pollUntilRef.current = 0;
        setWaitTimedOut(false);
        setTapBusy(false);
      }
    },
    [token, turnstileToken]
  );

  useEffect(() => {
    let lastOpenFetch = 0;
    const fetchLatest = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      const now = Date.now();
      if (now - lastOpenFetch < 1_500) return;
      lastOpenFetch = now;
      pollUntilRef.current = Date.now() + POLL_MAX_MS;
      setWaitTimedOut(false);
      void load({ refresh: true });
    };

    fetchLatest();

    const onVisible = () => {
      if (document.visibilityState === 'visible') fetchLatest();
    };
    const onPageShow = () => fetchLatest();

    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('pageshow', onPageShow);

    const auto = setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      pollUntilRef.current = Date.now() + POLL_MAX_MS;
      void load();
    }, AUTO_REFRESH_MS);

    return () => {
      clearInterval(auto);
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('pageshow', onPageShow);
    };
  }, [token, turnstileToken, load]);

  const screen = screenFor(data, phase, waitTimedOut, tapBusy);

  return (
    <div className={cn('flex min-h-dvh flex-col text-slate-900 antialiased', screen.page)}>
      <main className="relative z-0 mx-auto flex w-full max-w-lg flex-1 flex-col items-center justify-center px-4 py-10 sm:px-6">
        <div className="w-full overflow-hidden rounded-3xl border border-white/70 bg-white/80 p-5 shadow-[0_12px_40px_-18px_rgba(15,23,42,0.28)] backdrop-blur-sm sm:p-7">
          <div
            className={cn(
              'rounded-3xl border p-6 text-center sm:p-8',
              screen.checking && 'flex min-h-[14rem] flex-col items-center justify-center sm:min-h-[16rem]',
              screen.card
            )}
            aria-busy={screen.checking || undefined}
            aria-live="polite"
          >
            {screen.checking ? (
              <Loader2
                className="mb-5 h-14 w-14 animate-spin text-emerald-600 sm:mb-6 sm:h-16 sm:w-16"
                aria-hidden
              />
            ) : null}
            <h1 className="max-w-[16ch] text-center text-5xl font-bold leading-[1.05] tracking-tight sm:text-7xl">
              {screen.title}
            </h1>
            {screen.sub ? (
              <p className="mt-4 text-center text-xl font-medium opacity-80 sm:text-2xl">
                {screen.sub}
              </p>
            ) : null}
          </div>

          {phase === 'bot' && isTurnstileEnabled() ? (
            <div className="mt-6 w-full">
              <TurnstileWidget action="office_status" theme="light" onToken={setTurnstileToken} />
            </div>
          ) : null}

          {phase !== 'missing' && phase !== 'bot' && !screen.checking ? (
            <Button
              type="button"
              size="lg"
              className={cn(
                'mt-6 h-12 min-h-11 w-full cursor-pointer rounded-2xl text-[15px] font-semibold shadow-sm transition active:scale-[0.99]',
                isEleven ? 'bg-emerald-700 hover:bg-emerald-800' : 'bg-sky-800 hover:bg-sky-900'
              )}
              onClick={() => {
                if (tapBusy || refreshingRef.current) return;
                if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
                pollUntilRef.current = Date.now() + POLL_MAX_MS;
                setWaitTimedOut(false);
                setTapBusy(true);
                void load({ refresh: true });
              }}
            >
              <RefreshCw className="mr-2 h-5 w-5" aria-hidden />
              Refresh
            </Button>
          ) : null}

          {installEvent ? (
            <Button
              type="button"
              variant="outline"
              className={cn(
                'mt-4 h-11 min-h-11 w-full cursor-pointer rounded-full border bg-white px-4 text-sm font-semibold shadow-sm transition active:scale-[0.99]',
                isEleven
                  ? 'border-emerald-200 text-emerald-800 hover:bg-emerald-50'
                  : 'border-sky-200 text-sky-800 hover:bg-sky-50'
              )}
              onClick={async () => {
                await installEvent.prompt();
                setInstallEvent(null);
              }}
            >
              <Home className="mr-2 h-4 w-4" aria-hidden />
              Add to Home Screen
            </Button>
          ) : null}

          {showIosHint && !isPWAMode() && phase !== 'missing' ? (
            <p className="mt-4 text-center text-sm leading-relaxed text-slate-600">
              On iPhone: tap Share, then Add to Home Screen.
            </p>
          ) : null}
        </div>
      </main>
    </div>
  );
}
