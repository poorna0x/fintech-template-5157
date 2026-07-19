import { useEffect, useMemo, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { AlertTriangle, BellOff, CheckCircle2, Loader2, MessageSquare, Send } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import type { Technician } from '@/types';

type MessageTechnicianDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  technicians: Technician[];
};

type SendStatus = 'sent' | 'no_app' | 'failed';

const TITLE_MAX = 120;
const BODY_MAX = 300;

/**
 * All custom messages share this notification tag, so sending a new one
 * REPLACES the previous message on the phone instead of stacking up.
 */
const MESSAGE_TAG = 'office_message';

/**
 * Send a custom push notification to one or more technicians' phones,
 * or clear the app's notifications from their tray. Delivery goes straight
 * through FCM (same pipeline as job-assignment pushes) — nothing is stored.
 */
const MessageTechnicianDialog = ({
  open,
  onOpenChange,
  technicians,
}: MessageTechnicianDialogProps) => {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [allowReply, setAllowReply] = useState(true);
  const [sending, setSending] = useState(false);
  const [results, setResults] = useState<Record<string, SendStatus>>({});

  const activeTechnicians = useMemo(
    () => technicians.filter((t) => (t as any).isActive !== false),
    [technicians]
  );

  useEffect(() => {
    if (!open) {
      setSelected(new Set());
      setTitle('');
      setMessage('');
      setAllowReply(true);
      setResults({});
      setSending(false);
    }
  }, [open]);

  const allSelected =
    activeTechnicians.length > 0 && activeTechnicians.every((t) => selected.has(t.id));

  const toggleAll = () => {
    setSelected(allSelected ? new Set() : new Set(activeTechnicians.map((t) => t.id)));
  };

  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  /**
   * mode 'send': deliver the typed message (tagged, so it replaces the
   * previous office message on the phone). mode 'clear': silent push that
   * removes all of our app's notifications from the phone's tray.
   */
  const dispatch = async (mode: 'send' | 'clear') => {
    const body = message.trim();
    if (selected.size === 0 || (mode === 'send' && !body)) return;
    setSending(true);
    setResults({});

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) {
        toast.error('Session expired — sign in again.');
        return;
      }

      const payload =
        mode === 'send'
          ? {
              title: title.trim() || 'Message from office',
              body,
              color: '#2563EB',
              tag: MESSAGE_TAG,
              allowReply,
            }
          : { clear: true };

      const outcomes = await Promise.all(
        [...selected].map(async (technicianId): Promise<[string, SendStatus]> => {
          try {
            const res = await fetch('/.netlify/functions/send-tech-push', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`,
              },
              body: JSON.stringify({ technicianId, ...payload }),
            });
            const out = (await res.json().catch(() => null)) as
              | { sent?: boolean; reason?: string }
              | null;
            if (res.ok && out?.sent) return [technicianId, 'sent'];
            if (out?.reason === 'no_token' || out?.reason === 'stale_token')
              return [technicianId, 'no_app'];
            return [technicianId, 'failed'];
          } catch {
            return [technicianId, 'failed'];
          }
        })
      );

      const map = Object.fromEntries(outcomes) as Record<string, SendStatus>;
      setResults(map);

      const okCount = outcomes.filter(([, s]) => s === 'sent').length;
      const verb = mode === 'send' ? 'Message sent' : 'Notifications cleared';
      if (okCount === outcomes.length) {
        toast.success(
          okCount === 1 ? verb : `${verb} — ${okCount} technicians`
        );
      } else if (okCount > 0) {
        toast.warning(`Done for ${okCount} of ${outcomes.length} — see details below.`);
      } else {
        toast.error("Couldn't reach any of the phones — see details below.");
      }
    } finally {
      setSending(false);
    }
  };

  const statusOf = (id: string): SendStatus | undefined => results[id];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* Don't auto-focus the first control (Select all) — it draws a focus ring */}
      <DialogContent
        className="sm:max-w-md max-h-[90vh] overflow-y-auto"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <DialogHeader className="pr-8 text-left">
          <DialogTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5" />
            Message technician
          </DialogTitle>
          <DialogDescription>
            Sends a push notification to their phone. Nothing is stored.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Recipients */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <Label>To</Label>
              <button
                type="button"
                className="text-xs font-medium text-primary hover:underline"
                onClick={toggleAll}
              >
                {allSelected ? 'Clear all' : 'Select all'}
              </button>
            </div>
            <div className="max-h-44 space-y-1 overflow-y-auto rounded-lg border p-2">
              {activeTechnicians.length === 0 && (
                <p className="p-2 text-sm text-muted-foreground">No technicians found.</p>
              )}
              {activeTechnicians.map((tech) => {
                const status = statusOf(tech.id);
                const photo = tech.photo?.trim();
                const initials = (tech.fullName || '?')
                  .split(/\s+/)
                  .filter(Boolean)
                  .slice(0, 2)
                  .map((p) => p[0]?.toUpperCase() || '')
                  .join('');
                return (
                  <label
                    key={tech.id}
                    className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-1.5 hover:bg-muted"
                  >
                    <Checkbox
                      checked={selected.has(tech.id)}
                      onCheckedChange={() => toggleOne(tech.id)}
                      disabled={sending}
                    />
                    {photo ? (
                      <img
                        src={photo}
                        alt=""
                        className="h-8 w-8 shrink-0 rounded-full object-cover bg-muted"
                        loading="lazy"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <span
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sky-100 text-xs font-semibold text-sky-800 dark:bg-sky-950 dark:text-sky-200"
                        aria-hidden
                      >
                        {initials || '?'}
                      </span>
                    )}
                    <span className="flex-1 truncate text-sm">{tech.fullName}</span>
                    {status === 'sent' && <CheckCircle2 className="h-4 w-4 text-green-600" />}
                    {status === 'no_app' && (
                      <span className="flex items-center gap-1 text-xs text-amber-600">
                        <AlertTriangle className="h-3.5 w-3.5" />
                        allow notifications
                      </span>
                    )}
                    {status === 'failed' && (
                      <span className="flex items-center gap-1 text-xs text-red-600">
                        <AlertTriangle className="h-3.5 w-3.5" />
                        failed
                      </span>
                    )}
                  </label>
                );
              })}
            </div>
          </div>

          {/* Title (optional) */}
          <div className="space-y-1.5">
            <Label htmlFor="msg-title">
              Title <span className="font-normal text-muted-foreground">(optional)</span>
            </Label>
            <Input
              id="msg-title"
              placeholder="Message from office"
              value={title}
              maxLength={TITLE_MAX}
              onChange={(e) => setTitle(e.target.value)}
              disabled={sending}
            />
          </div>

          {/* Message */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="msg-body">Message</Label>
              <span className="text-xs text-muted-foreground">
                {message.length}/{BODY_MAX}
              </span>
            </div>
            <Textarea
              id="msg-body"
              placeholder="Type the message…"
              value={message}
              maxLength={BODY_MAX}
              rows={4}
              onChange={(e) => setMessage(e.target.value)}
              disabled={sending}
            />
          </div>

          <label className="flex cursor-pointer items-start gap-3 rounded-lg border-2 border-sky-300 bg-sky-50 p-3 dark:border-sky-700 dark:bg-sky-950/40">
            <Checkbox
              checked={allowReply}
              onCheckedChange={(c) => setAllowReply(c === true)}
              disabled={sending}
              className="mt-0.5"
            />
            <div className="min-w-0 space-y-0.5">
              <span className="text-sm font-semibold leading-none">Allow reply (on by default)</span>
              <p className="text-xs text-muted-foreground leading-snug">
                Shows a Reply button on their notification. They reply → you get a push and can
                reply back. Nothing is saved. Uncheck for one-way alerts only.
              </p>
            </div>
          </label>

          <div className="space-y-2">
            <Button
              className="h-11 w-full"
              onClick={() => void dispatch('send')}
              disabled={sending || selected.size === 0 || !message.trim()}
            >
              {sending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <Send className="mr-2 h-4 w-4" />
                  Send{selected.size > 1 ? ` to ${selected.size} technicians` : ''}
                </>
              )}
            </Button>
            <Button
              variant="outline"
              className="h-11 w-full"
              onClick={() => void dispatch('clear')}
              disabled={sending || selected.size === 0}
            >
              <BellOff className="mr-2 h-4 w-4" />
              Clear app notifications on their phone
            </Button>
            <p className="text-xs text-muted-foreground">
              Sending a new message replaces your previous one on the phone. Clear removes
              all this app's notifications still in their tray (job alerts, OTP requests,
              messages) — it can't unsee anything already read.
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default MessageTechnicianDialog;
