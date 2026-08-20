import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Home, Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import TurnstileWidget, { isTurnstileEnabled } from '@/components/TurnstileWidget';
import {
  fetchPublicTechOfficeStatus,
  type PublicTechOfficeStatus,
} from '@/lib/techOfficeStatus';
import { saveWherePwaToken } from '@/lib/wherePwaLaunch';
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
  waitTimedOut: boolean
) {
  if (phase === 'missing') {
    return {
      bg: 'bg-slate-700',
      title: 'Not available',
      sub: '',
    };
  }
  if (phase === 'bot') {
    return {
      bg: 'bg-slate-700',
      title: 'Please wait',
      sub: 'Security check',
    };
  }
  const stillChecking =
    !waitTimedOut &&
    (!data || phase === 'loading' || data.status === 'checking');
  if (stillChecking) {
    return {
      bg: 'bg-slate-600',
      title: 'Checking…',
      sub: data?.firstName ? `Looking for ${data.firstName}` : '',
    };
  }
  if (data?.status === 'in_office') {
    return {
      bg: 'bg-emerald-600',
      title: 'In office',
      sub: data.live ? '' : data.checkedAt ? `Last seen ${checkedLabel(data.checkedAt)}` : '',
    };
  }
  if (data?.status === 'en_route' && data.etaMinutes) {
    return {
      bg: 'bg-amber-600',
      title: `${data.etaMinutes} min`,
      sub: 'to office',
    };
  }
  return {
    bg: 'bg-slate-600',
    title: 'Can’t get travel time',
    sub: data?.checkedAt ? `Checked ${checkedLabel(data.checkedAt)}` : '',
  };
}

export default function PublicTechOfficeStatusPage() {
  const { token = '' } = useParams<{ token: string }>();
  const [data, setData] = useState<PublicTechOfficeStatus | null>(() =>
    token ? readCache(token) : null
  );
  const [phase, setPhase] = useState<'loading' | 'ready' | 'missing' | 'bot'>('loading');
  const [turnstileToken, setTurnstileToken] = useState('');
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIosHint, setShowIosHint] = useState(false);
  const [waitTimedOut, setWaitTimedOut] = useState(false);
  const pollUntilRef = useRef(0);
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refreshingRef = useRef(false);

  useEffect(() => {
    if (token) saveWherePwaToken(token);
    void registerWherePWA();
    const theme = document.querySelector('meta[name="theme-color"]');
    if (theme) theme.setAttribute('content', '#16a34a');
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
    async (opts?: { poll?: boolean }) => {
      if (!token) {
        setPhase('missing');
        return;
      }
      if (phase === 'bot' && isTurnstileEnabled() && !turnstileToken) {
        return;
      }
      if (refreshingRef.current) return;
      refreshingRef.current = true;
      const result = await fetchPublicTechOfficeStatus(token, turnstileToken || undefined);
      refreshingRef.current = false;
      if (result.ok === false) {
        if (result.error === 'not_found') {
          setData(null);
          setPhase('missing');
          return;
        }
        if (result.error === 'bot') {
          setPhase('bot');
          return;
        }
        setPhase(data ? 'ready' : 'loading');
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
        }
      } else {
        pollUntilRef.current = 0;
        setWaitTimedOut(false);
      }
    },
    [token, turnstileToken, data]
  );

  useEffect(() => {
    pollUntilRef.current = Date.now() + POLL_MAX_MS;
    setWaitTimedOut(false);
    void load();
    const auto = setInterval(() => {
      pollUntilRef.current = Date.now() + POLL_MAX_MS;
      void load();
    }, AUTO_REFRESH_MS);
    return () => {
      clearInterval(auto);
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
    };
    // Intentionally once per token / turnstile solve
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, turnstileToken]);

  const screen = screenFor(data, phase, waitTimedOut);
  const checking =
    !waitTimedOut && (phase === 'loading' || data?.status === 'checking');

  return (
    <div
      className={`flex min-h-dvh flex-col items-center justify-center px-6 py-10 text-white ${screen.bg} transition-colors duration-300 motion-reduce:transition-none`}
    >
      <h1 className="max-w-[16ch] text-center text-6xl font-bold leading-[1.05] tracking-tight sm:text-8xl">
        {screen.title}
      </h1>
      {screen.sub ? (
        <p className="mt-4 text-center text-2xl font-medium text-white/90 sm:text-3xl">{screen.sub}</p>
      ) : null}

      {phase === 'bot' && isTurnstileEnabled() ? (
        <div className="mt-8 w-full max-w-sm">
          <TurnstileWidget action="office_status" theme="light" onToken={setTurnstileToken} />
        </div>
      ) : null}

      {phase !== 'missing' && phase !== 'bot' ? (
        <Button
          type="button"
          size="lg"
          className="mt-12 h-14 min-h-11 cursor-pointer rounded-full bg-white px-8 text-lg font-semibold text-slate-900 hover:bg-white/90"
          onClick={() => {
            pollUntilRef.current = Date.now() + POLL_MAX_MS;
            setWaitTimedOut(false);
            void load();
          }}
        >
          {checking ? (
            <Loader2 className="mr-2 h-5 w-5 animate-spin" aria-hidden />
          ) : (
            <RefreshCw className="mr-2 h-5 w-5" aria-hidden />
          )}
          Refresh
        </Button>
      ) : null}

      {installEvent ? (
        <Button
          type="button"
          variant="outline"
          className="mt-6 h-12 min-h-11 cursor-pointer rounded-full border-white/40 bg-transparent px-6 text-base text-white hover:bg-white/10 hover:text-white"
          onClick={async () => {
            await installEvent.prompt();
            setInstallEvent(null);
          }}
        >
          <Home className="mr-2 h-5 w-5" aria-hidden />
          Add to Home Screen
        </Button>
      ) : null}

      {showIosHint && !isPWAMode() && phase !== 'missing' ? (
        <p className="mt-6 max-w-sm text-center text-base leading-snug text-white/85">
          On iPhone: tap Share, then Add to Home Screen.
        </p>
      ) : null}
    </div>
  );
}
