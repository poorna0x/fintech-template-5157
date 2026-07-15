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
import { AlertTriangle, CheckCircle2, Loader2, MessageSquare, Send } from 'lucide-react';
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
 * Send a custom push notification to one or more technicians' phones.
 * Delivery goes straight through FCM (same pipeline as job-assignment
 * pushes) — nothing is stored anywhere.
 */
const MessageTechnicianDialog = ({
  open,
  onOpenChange,
  technicians,
}: MessageTechnicianDialogProps) => {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
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

  const handleSend = async () => {
    const body = message.trim();
    if (!body || selected.size === 0) return;
    setSending(true);
    setResults({});

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) {
        toast.error('Session expired — sign in again.');
        return;
      }

      const outcomes = await Promise.all(
        [...selected].map(async (technicianId): Promise<[string, SendStatus]> => {
          try {
            const res = await fetch('/.netlify/functions/send-tech-push', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`,
              },
              body: JSON.stringify({
                technicianId,
                title: title.trim() || 'Message from office',
                body,
                color: '#2563EB',
              }),
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

      const sentCount = outcomes.filter(([, s]) => s === 'sent').length;
      if (sentCount === outcomes.length) {
        toast.success(
          sentCount === 1 ? 'Message sent' : `Message sent to ${sentCount} technicians`
        );
      } else if (sentCount > 0) {
        toast.warning(`Sent to ${sentCount} of ${outcomes.length} — see details below.`);
      } else {
        toast.error("Couldn't deliver the message — see details below.");
      }
    } finally {
      setSending(false);
    }
  };

  const statusOf = (id: string): SendStatus | undefined => results[id];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
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
                    <span className="flex-1 truncate text-sm">{tech.fullName}</span>
                    {status === 'sent' && <CheckCircle2 className="h-4 w-4 text-green-600" />}
                    {status === 'no_app' && (
                      <span className="flex items-center gap-1 text-xs text-amber-600">
                        <AlertTriangle className="h-3.5 w-3.5" />
                        no app
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

          <Button
            className="h-11 w-full"
            onClick={() => void handleSend()}
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
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default MessageTechnicianDialog;
