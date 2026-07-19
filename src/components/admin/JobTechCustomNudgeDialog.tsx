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
  getJobAssignedTechnicianId,
  getJobCustomerName,
  sendJobCustomNudge,
} from '@/lib/adminJobTechNudges';

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
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!open) {
      setMessage('');
      setAllowReply(true);
      setSending(false);
    }
  }, [open]);

  const customerName = job ? getJobCustomerName(job as any) : '';
  const techId = job ? getJobAssignedTechnicianId(job as any) : null;

  const handleSend = async () => {
    if (!job || !techId || !message.trim()) return;
    setSending(true);
    try {
      const result = await sendJobCustomNudge(job as any, message, { allowReply });
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
          <DialogDescription>
            Only for {customerName || 'this customer'}
            {technicianName ? ` → ${technicianName}` : ' → assigned tech'}. Not a general message.
            They can reply from the notification if enabled.
          </DialogDescription>
        </DialogHeader>

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
