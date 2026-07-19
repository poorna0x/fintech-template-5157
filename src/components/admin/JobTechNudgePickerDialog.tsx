import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  AlertCircle,
  Clock,
  Hourglass,
  ImagePlus,
  Loader2,
  MessageSquare,
  Navigation,
  Phone,
} from 'lucide-react';
import type { Job } from '@/types';
import {
  formatNudgeCustomerLabel,
  getJobAssignedTechnicianId,
  getJobCustomerName,
  isCustomerWaitingLikely,
  isJobNotStarted,
  jobOrCustomerHasPhotosLocal,
  sendJobAreYouGoingNudge,
  sendJobCallCustomerNudge,
  sendJobCustomerWaitingNudge,
  sendJobOnTheWayNudge,
  sendJobPhotoNudge,
  sendJobStartNudge,
  sendJobTimeToFinishNudge,
} from '@/lib/adminJobTechNudges';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  job: Job | null;
  technicianName?: string | null;
  /** Opens the custom message dialog after closing this picker. */
  onCustomMessage: (job: Job) => void;
};

/**
 * Mobile-safe replacement for DropdownMenuSub: nested submenus collide /
 * clip on narrow admin screens. This centered dialog lists the same nudges.
 */
export default function JobTechNudgePickerDialog({
  open,
  onOpenChange,
  job,
  technicianName,
  onCustomMessage,
}: Props) {
  const [busy, setBusy] = useState<string | null>(null);

  const customerName = job ? getJobCustomerName(job as any) : '';
  const customerLabel = formatNudgeCustomerLabel(customerName || 'Customer');
  const techId = job ? getJobAssignedTechnicianId(job as any) : null;

  const showPhoto = job ? !jobOrCustomerHasPhotosLocal(job as any) : false;
  const showStart = job
    ? isJobNotStarted(job as any) && String((job as any).status || '').toUpperCase() !== 'PENDING'
    : false;
  const showWaiting = job ? isCustomerWaitingLikely(job as any) : false;

  const run = async (key: string, fn: () => Promise<unknown>) => {
    if (!job || !techId || busy) return;
    setBusy(key);
    try {
      const result = await fn();
      if (result === 'sent' || result === 'skipped') onOpenChange(false);
    } finally {
      setBusy(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm gap-3">
        <DialogHeader>
          <DialogTitle>Nudge technician</DialogTitle>
          <DialogDescription asChild>
            <div className="text-sm text-muted-foreground">
              Push to {technicianName || 'assigned tech'}
              {customerName ? (
                <>
                  {' · '}
                  <span className="font-semibold tracking-wide text-violet-700">{customerLabel}</span>
                </>
              ) : null}
            </div>
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-1.5">
          {showPhoto && (
            <Button
              type="button"
              variant="outline"
              className="justify-start h-11"
              disabled={!!busy}
              onClick={() => void run('photo', () => sendJobPhotoNudge(job as any))}
            >
              {busy === 'photo' ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <ImagePlus className="mr-2 h-4 w-4" />
              )}
              Add purifier photo
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            className="justify-start h-11"
            disabled={!!busy}
            onClick={() => void run('call', () => sendJobCallCustomerNudge(job as any))}
          >
            {busy === 'call' ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Phone className="mr-2 h-4 w-4" />
            )}
            Call customer now
          </Button>
          <Button
            type="button"
            variant="outline"
            className="justify-start h-11"
            disabled={!!busy}
            onClick={() => void run('eta', () => sendJobOnTheWayNudge(job as any))}
          >
            {busy === 'eta' ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Navigation className="mr-2 h-4 w-4" />
            )}
            On the way? (reply ETA)
          </Button>
          {showStart && (
            <Button
              type="button"
              variant="outline"
              className="justify-start h-11"
              disabled={!!busy}
              onClick={() => void run('going', () => sendJobAreYouGoingNudge(job as any))}
            >
              {busy === 'going' ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Navigation className="mr-2 h-4 w-4" />
              )}
              Are you going? (Yes / No)
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            className="justify-start h-11"
            disabled={!!busy}
            onClick={() => void run('finish', () => sendJobTimeToFinishNudge(job as any))}
          >
            {busy === 'finish' ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Hourglass className="mr-2 h-4 w-4" />
            )}
            Time to finish? (reply)
          </Button>
          {showStart && (
            <Button
              type="button"
              variant="outline"
              className="justify-start h-11"
              disabled={!!busy}
              onClick={() => void run('start', () => sendJobStartNudge(job as any))}
            >
              {busy === 'start' ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Clock className="mr-2 h-4 w-4" />
              )}
              Start this job (tap Start)
            </Button>
          )}
          {showWaiting && (
            <Button
              type="button"
              variant="outline"
              className="justify-start h-11"
              disabled={!!busy}
              onClick={() => void run('wait', () => sendJobCustomerWaitingNudge(job as any))}
            >
              {busy === 'wait' ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <AlertCircle className="mr-2 h-4 w-4" />
              )}
              Customer waiting
            </Button>
          )}
          <Button
            type="button"
            variant="secondary"
            className="justify-start h-11 mt-1"
            disabled={!!busy}
            onClick={() => {
              if (!job) return;
              onOpenChange(false);
              onCustomMessage(job);
            }}
          >
            <MessageSquare className="mr-2 h-4 w-4" />
            Message about this job…
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
