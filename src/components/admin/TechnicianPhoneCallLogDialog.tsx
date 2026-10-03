import { useEffect, useState } from 'react';
import { Loader2, Phone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { supabase } from '@/lib/supabase';

type CallRow = {
  at: number;
  number: string;
  type: number;
  seconds: number;
  name: string;
};

type Snapshot = {
  status: string;
  calls: CallRow[];
  error: string | null;
};

const TYPE_LABEL: Record<number, string> = {
  1: 'Incoming',
  2: 'Outgoing',
  3: 'Missed',
  5: 'Rejected',
  6: 'Blocked',
  7: 'Answered',
};

function callLabel(type: number): string {
  return TYPE_LABEL[type] || 'Call';
}

function formatWhen(at: number): string {
  if (!Number.isFinite(at)) return '';
  return new Date(at).toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatLength(seconds: number): string {
  if (!seconds) return '';
  const mins = Math.floor(seconds / 60);
  const rest = seconds % 60;
  if (mins <= 0) return `${rest}s`;
  return `${mins}m ${rest}s`;
}

export default function TechnicianPhoneCallLogDialog({
  technicianId,
  technicianName,
}: {
  technicianId: string;
  technicianName: string;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [calls, setCalls] = useState<CallRow[]>([]);

  useEffect(() => {
    if (!open) return;
    setCalls([]);
    setMessage('');
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const finish = (text: string, rows: CallRow[]) => {
      if (stopped) return;
      setCalls(rows);
      setMessage(text);
      setLoading(false);
    };

    const poll = async (requestId: string, left: number) => {
      const { data, error } = await supabase
        .from('technician_phone_call_logs')
        .select('status, calls, error')
        .eq('id', requestId)
        .maybeSingle();
      if (stopped) return;
      if (error) {
        finish('Run the call-log SQL in Supabase, then try again.', []);
        return;
      }
      const row = data as Snapshot | null;
      if (row?.status === 'ready') {
        const list = Array.isArray(row.calls) ? row.calls : [];
        finish(list.length ? '' : 'No calls saved on this phone for the last 45 days.', list);
        return;
      }
      if (row?.status === 'failed') {
        finish(row.error || 'The phone did not send its call log.', []);
        return;
      }
      if (left <= 0) {
        finish('The phone did not answer. Ask them to open the technician app, then try again.', []);
        return;
      }
      timer = setTimeout(() => void poll(requestId, left - 1), 2000);
    };

    const start = async () => {
      setLoading(true);
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) {
        finish('Sign in again, then try once more.', []);
        return;
      }
      try {
        const res = await fetch('/.netlify/functions/request-tech-call-log', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ technicianId }),
        });
        const payload = await res.json().catch(() => null);
        if (!res.ok || !payload?.requestId) {
          finish('Could not ask the phone for its call log.', []);
          return;
        }
        if (payload.sent === false) {
          finish('This technician’s phone is not signed in to the app.', []);
          return;
        }
        void poll(String(payload.requestId), 15);
      } catch {
        finish('Could not ask the phone for its call log.', []);
      }
    };

    void start();
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
  }, [open, technicianId]);

  return (
    <>
      <Button
        type="button"
        variant="outline"
        className="h-11 w-full"
        disabled={!technicianId}
        onClick={() => setOpen(true)}
      >
        <Phone className="h-4 w-4" />
        Get call log
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader className="pr-10 text-left">
            <DialogTitle>Phone call log</DialogTitle>
            <DialogDescription>
              {technicianName || 'Technician'} · last 45 days, saved on their phone and sent only when you ask.
            </DialogDescription>
          </DialogHeader>
          {loading && (
            <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Asking the phone…
            </div>
          )}
          {!loading && message && <p className="text-sm text-muted-foreground">{message}</p>}
          {!loading && calls.length > 0 && (
            <ul className="divide-y rounded-lg border">
              {calls.map((call) => (
                <li key={`${call.at}-${call.number}`} className="px-3 py-2 text-sm">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="font-medium">{call.name || call.number}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">{callLabel(call.type)}</span>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {call.name ? `${call.number} · ` : ''}
                    {formatWhen(call.at)}
                    {formatLength(call.seconds) ? ` · ${formatLength(call.seconds)}` : ''}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
