import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

const SAMPLE_PDF =
  'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf';

type ApiResult = {
  ok: boolean;
  status: number;
  body: unknown;
};

type WebhookEvent = {
  receivedAt?: string;
  summaries?: Array<Record<string, unknown>>;
  payload?: unknown;
};

type StoredMessage = {
  id?: string;
  direction?: string;
  phone_e164?: string;
  msg_type?: string;
  body?: string | null;
  media_url?: string | null;
  status?: string | null;
  created_at?: string;
};

async function callSend(payload: Record<string, unknown>): Promise<ApiResult> {
  const res = await fetch('/.netlify/functions/whatsapp-send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const body = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, body };
}

function ResultPanel({ result }: { result: ApiResult | null }) {
  if (!result) {
    return (
      <p className="text-sm text-slate-500">API response will appear here after you send.</p>
    );
  }
  return (
    <div className="space-y-2">
      <p
        className={`text-sm font-medium ${result.ok ? 'text-emerald-700' : 'text-red-700'}`}
      >
        {result.ok ? 'Success' : 'Error'} — HTTP {result.status}
      </p>
      <pre className="max-h-80 overflow-auto rounded-md border border-slate-200 bg-slate-50 p-3 text-xs text-slate-800">
        {JSON.stringify(result.body, null, 2)}
      </pre>
    </div>
  );
}

/**
 * POC only — Meta WhatsApp Cloud API text + PDF send + inbound webhook display.
 */
export default function WhatsAppTest() {
  const [phone, setPhone] = useState('');
  const [pocSecret, setPocSecret] = useState(() => {
    try {
      return sessionStorage.getItem('wa_poc_secret') || '';
    } catch {
      return '';
    }
  });
  const [text, setText] = useState('Hello from HydrogenRO WhatsApp Cloud API POC');
  const [pdfUrl, setPdfUrl] = useState(SAMPLE_PDF);
  const [pdfFilename, setPdfFilename] = useState('sample.pdf');
  const [pdfCaption, setPdfCaption] = useState('Your document from Hydrogen RO');
  const [busy, setBusy] = useState<'template' | 'text' | 'pdf' | null>(null);
  const [result, setResult] = useState<ApiResult | null>(null);
  const [inbound, setInbound] = useState<WebhookEvent[]>([]);
  const [storedMessages, setStoredMessages] = useState<StoredMessage[]>([]);
  const [inboundError, setInboundError] = useState<string | null>(null);

  const basePayload = () => ({
    to: phone.trim(),
    ...(pocSecret.trim() ? { pocSecret: pocSecret.trim() } : {}),
  });

  useEffect(() => {
    try {
      if (pocSecret.trim()) sessionStorage.setItem('wa_poc_secret', pocSecret.trim());
    } catch {
      /* ignore */
    }
  }, [pocSecret]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!pocSecret.trim()) {
        setInboundError('Enter POC secret above (WHATSAPP_POC_SECRET from .env.local) to load messages.');
        setStoredMessages([]);
        return;
      }
      try {
        const qs = `?secret=${encodeURIComponent(pocSecret.trim())}`;
        const res = await fetch(`/.netlify/functions/whatsapp-events${qs}`);
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok) {
          setInboundError(
            data?.error === 'Unauthorized'
              ? 'Unauthorized — POC secret does not match WHATSAPP_POC_SECRET in .env.local'
              : data?.error || `HTTP ${res.status}`
          );
          return;
        }
        setInboundError(null);
        setInbound(Array.isArray(data.events) ? data.events : []);
        setStoredMessages(Array.isArray(data.messages) ? data.messages : []);
      } catch (err) {
        if (!cancelled) {
          setInboundError(err instanceof Error ? err.message : 'Failed to load');
        }
      }
    };
    void load();
    const id = window.setInterval(load, 3000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [pocSecret]);

  const run = async (kind: 'template' | 'text' | 'pdf', payload: Record<string, unknown>) => {
    setBusy(kind);
    setResult(null);
    try {
      const res = await callSend(payload);
      setResult(res);
    } catch (err) {
      setResult({
        ok: false,
        status: 0,
        body: { error: err instanceof Error ? err.message : 'Request failed' },
      });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-10 font-inter">
      <div className="mx-auto max-w-xl space-y-8">
        <header className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            WhatsApp Cloud API Test
          </h1>
          <p className="text-sm text-slate-600">
            Local Cloud API POC (Phase 1). Outbound is logged to{' '}
            <code className="text-xs">whatsapp_messages</code> (long retention; cleanup in inbox). Recipient as
            digits only, e.g. 9198XXXXXXXX.
          </p>
        </header>

        <section className="space-y-4 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <div className="space-y-2">
            <Label htmlFor="wa-phone">Phone number</Label>
            <Input
              id="wa-phone"
              inputMode="tel"
              placeholder="9198XXXXXXXX"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              autoComplete="tel"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="wa-secret">
              POC secret <span className="font-normal text-red-600">(required to view stored messages)</span>
            </Label>
            <Input
              id="wa-secret"
              type="password"
              placeholder="WHATSAPP_POC_SECRET from .env.local"
              value={pocSecret}
              onChange={(e) => setPocSecret(e.target.value)}
              autoComplete="off"
            />
            <p className="text-xs text-slate-500">
              Same value you use to Send text. Without it the list shows Unauthorized.
            </p>
          </div>
        </section>

        <section className="space-y-4 rounded-lg border border-amber-200 bg-amber-50/80 p-5 shadow-sm">
          <div>
            <h2 className="text-base font-semibold text-slate-900">1. Open the 24h window</h2>
            <p className="mt-1 text-sm text-slate-700">
              On your <strong>real</strong> number, <code className="text-xs">hello_world</code> does
              not work (Meta error 131058 — test numbers only). Instead: from your personal
              WhatsApp, send any message to the business number{' '}
              <code className="text-xs">+91 87924 67611</code>, then use Send text / PDF below.
            </p>
            <p className="mt-2 text-sm text-slate-600">
              Cold messages later need your own approved template (Message templates in Meta).
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            className="border-slate-300"
            disabled={!phone.trim() || busy !== null}
            onClick={() => run('template', { ...basePayload(), type: 'template' })}
            title="Only works from Meta public test numbers"
          >
            {busy === 'template' ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : null}
            Send hello_world (test numbers only — will fail on prod)
          </Button>
        </section>

        <section className="space-y-4 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-base font-semibold text-slate-900">2. Send text</h2>
          <div className="space-y-2">
            <Label htmlFor="wa-text">Message</Label>
            <Textarea
              id="wa-text"
              rows={4}
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
          </div>
          <Button
            type="button"
            className="bg-sky-700 hover:bg-sky-800"
            disabled={!phone.trim() || !text.trim() || busy !== null}
            onClick={() => run('text', { ...basePayload(), type: 'text', text: text.trim() })}
          >
            {busy === 'text' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Send text
          </Button>
        </section>

        <section className="space-y-4 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-base font-semibold text-slate-900">3. Send PDF</h2>
          <div className="space-y-2">
            <Label htmlFor="wa-pdf">Public PDF URL (https)</Label>
            <Input
              id="wa-pdf"
              value={pdfUrl}
              onChange={(e) => setPdfUrl(e.target.value)}
              placeholder={SAMPLE_PDF}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="wa-pdf-name">Filename</Label>
            <Input
              id="wa-pdf-name"
              value={pdfFilename}
              onChange={(e) => setPdfFilename(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="wa-pdf-caption">Caption</Label>
            <Textarea
              id="wa-pdf-caption"
              rows={2}
              value={pdfCaption}
              onChange={(e) => setPdfCaption(e.target.value)}
              placeholder="Optional text shown with the PDF"
            />
          </div>
          <Button
            type="button"
            className="bg-sky-700 hover:bg-sky-800"
            disabled={!phone.trim() || !pdfUrl.trim() || busy !== null}
            onClick={() =>
              run('pdf', {
                ...basePayload(),
                type: 'document',
                link: pdfUrl.trim(),
                filename: pdfFilename.trim() || 'document.pdf',
                ...(pdfCaption.trim() ? { caption: pdfCaption.trim() } : {}),
              })
            }
          >
            {busy === 'pdf' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Send PDF
          </Button>
        </section>

        <section className="space-y-3 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-base font-semibold text-slate-900">API response</h2>
          <ResultPanel result={result} />
        </section>

        <section className="space-y-3 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-base font-semibold text-slate-900">Stored messages</h2>
            <p className="text-xs text-slate-500">From Supabase · auto-refresh 3s</p>
          </div>
          <p className="text-sm text-slate-600">
            Inbound webhook rows + outbound sends. Configure Meta Callback URL via ngrok →
            local <code className="text-xs">whatsapp-webhook</code> (no Netlify deploy).
          </p>
          {inboundError ? <p className="text-sm text-red-700">{inboundError}</p> : null}
          {storedMessages.length === 0 ? (
            <p className="text-sm text-slate-500">No rows in whatsapp_messages yet.</p>
          ) : (
            <ul className="max-h-96 space-y-2 overflow-auto text-sm">
              {storedMessages.map((m) => (
                <li
                  key={m.id}
                  className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2"
                >
                  <div className="flex flex-wrap gap-x-2 gap-y-1 text-xs text-slate-500">
                    <span>{m.created_at}</span>
                    <span>{m.direction}</span>
                    <span>{m.msg_type}</span>
                    <span>{m.phone_e164}</span>
                    <span>{m.status}</span>
                  </div>
                  <p className="mt-1 text-slate-800">{m.body || '(no text)'}</p>
                  {m.media_url ? (
                    <a
                      className="mt-1 block truncate text-xs text-sky-700 underline"
                      href={m.media_url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {m.media_url}
                    </a>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="space-y-3 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-base font-semibold text-slate-900">Webhook memory (debug)</h2>
            <p className="text-xs text-slate-500">Auto-refresh 3s</p>
          </div>
          {inbound.length === 0 ? (
            <p className="text-sm text-slate-500">No in-memory webhook events yet.</p>
          ) : (
            <pre className="max-h-96 overflow-auto rounded-md border border-slate-200 bg-slate-50 p-3 text-xs text-slate-800">
              {JSON.stringify(inbound, null, 2)}
            </pre>
          )}
        </section>
      </div>
    </div>
  );
}
