import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Send } from 'lucide-react';
import type { Job } from '@/types';
import {
  formatNudgeCustomerLabel,
  getJobAssignedTechnicianId,
  getJobCustomerName,
  sendJobCustomNudge,
} from '@/lib/adminJobTechNudges';
import { getTechPushOverlayPref, setTechPushOverlayPref } from '@/lib/techPushDeliveryPrefs';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  job: Job | null;
  technicianName?: string | null;
};

const BODY_MAX = 300;

/** Job-scoped custom push (job ⋯ → Nudge tech → Message about this job). */
export default function JobTechCustomNudgeDialog({
  open,
  onOpenChange,
  job,
  technicianName,
}: Props) {
  const [message, setMessage] = useState('');
  const [allowReply, setAllowReply] = useState(true);
  const [showOverlay, setShowOverlay] = useState(() => getTechPushOverlayPref());
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!open) {
      setMessage('');
      setAllowReply(true);
      setShowOverlay(getTechPushOverlayPref());
      setSending(false);
    }
  }, [open]);

  const customerName = job ? getJobCustomerName(job as any) : '';
  const customerLabel = formatNudgeCustomerLabel(customerName || 'Customer');
  const techId = job ? getJobAssignedTechnicianId(job as any) : null;

  const handleSend = async () => {
    if (!job || !techId || !message.trim()) return;
    setSending(true);
    setTechPushOverlayPref(showOverlay);
    try {
      const result = await sendJobCustomNudge(job as any, message, {
        allowReply,
        overlay: showOverlay,
      });
      if (result === 'sent') onOpenChange(false);
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Message about this job</DialogTitle>
          <DialogDescription asChild>
            <div className="text-sm text-muted-foreground space-y-1.5">
              <p>
                Only for{' '}
                <span className="font-semibold tracking-wide text-violet-700">{customerLabel}</span>
                {technicianName ? ` → ${technicianName}` : ' → assigned tech'}.
              </p>
              <p className="text-xs">Not a general message. They can reply from the notification if enabled.</p>
            </div>
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-md border border-violet-200 bg-violet-50 px-3 py-2">
          <p className="text-[11px] uppercase tracking-wider text-violet-600/80 font-medium">Customer</p>
          <p className="text-base font-semibold tracking-wide text-violet-900">{customerLabel}</p>
        </div>

        <div className="space-y-3">
          <Textarea
            value={message}
            onChange={(e) => setMessage(e.target.value.slice(0, BODY_MAX))}
            placeholder={
              customerName
                ? `Message about ${customerName}'s job…`
                : 'Message about this job…'
            }
            rows={4}
            disabled={sending || !techId}
          />
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <label className="flex items-center gap-2 cursor-pointer">
              <Checkbox
                checked={allowReply}
                onCheckedChange={(v) => setAllowReply(v === true)}
                disabled={sending}
              />
              <span>Allow inline reply</span>
            </label>
            <span>
              {message.length}/{BODY_MAX}
            </span>
          </div>
          <label className="flex items-center gap-2 cursor-pointer text-xs text-muted-foreground">
            <Checkbox
              checked={showOverlay}
              onCheckedChange={(v) => {
                const on = v === true;
                setShowOverlay(on);
                setTechPushOverlayPref(on);
              }}
              disabled={sending}
            />
            <span>Also show on-screen overlay (with Reply)</span>
          </label>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={sending}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={() => void handleSend()}
            disabled={sending || !techId || !message.trim()}
            className="bg-violet-700 hover:bg-violet-800"
          >
            {sending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Send className="mr-2 h-4 w-4" />
            )}
            Send for this job
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
