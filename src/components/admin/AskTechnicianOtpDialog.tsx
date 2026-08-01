import { useEffect, useRef, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Copy, KeyRound, Loader2, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import {
  createOtpRequest,
  getOtpRequestForJob,
  getStoredOtpFromRequirements,
  watchOtpRequest,
  type OtpRequestRow,
} from '@/lib/technicianOtpRequests';
import { getTechPushOverlayPref, setTechPushOverlayPref } from '@/lib/techPushDeliveryPrefs';
import type { Job } from '@/types';

type AskTechnicianOtpDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  job: Job | null;
  technicianName?: string;
};

/**
 * Admin asks the assigned technician for the customer's 4-digit OTP
 * (Home Triangle leads, or jobs with Require OTP). If the technician already
 * entered it (at Start Work or earlier), it shows instantly from the job
 * itself — no push, no extra request. Otherwise sends a push and shows the
 * code live once the technician submits it.
 */
const AskTechnicianOtpDialog = ({
  open,
  onOpenChange,
  job,
  technicianName,
}: AskTechnicianOtpDialogProps) => {
  const [request, setRequest] = useState<OtpRequestRow | null>(null);
  const [storedOtp, setStoredOtp] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [failed, setFailed] = useState(false);
  const [showOverlay, setShowOverlay] = useState(() => getTechPushOverlayPref());
  const unwatchRef = useRef<(() => void) | null>(null);

  const stopWatching = () => {
    unwatchRef.current?.();
    unwatchRef.current = null;
  };

  const beginWatching = (row: OtpRequestRow) => {
    stopWatching();
    setRequest(row);
    if (!row.otp) {
      unwatchRef.current = watchOtpRequest(row.id, (next) => setRequest(next));
    }
  };

  const ask = async (jobRow: Job, reAsk: boolean) => {
    setStarting(true);
    setFailed(false);
    setTechPushOverlayPref(showOverlay);
    // Re-asking: stop showing the previously stored code so the dialog
    // clearly waits for the fresh one instead of displaying the old code.
    if (reAsk) setStoredOtp(null);
    try {
      const technicianId =
        (jobRow as any).assigned_technician_id || (jobRow as any).assignedTechnicianId;
      if (!technicianId) {
        toast.error('This job has no assigned technician.');
        onOpenChange(false);
        return;
      }

      // Reopening: show an already-submitted code instead of re-asking.
      if (!reAsk) {
        const existing = await getOtpRequestForJob(jobRow.id);
        if (existing?.otp) {
          beginWatching(existing);
          return;
        }
      }

      const customerName =
        ((jobRow.customer as any)?.full_name as string) ||
        ((jobRow.customer as any)?.fullName as string) ||
        undefined;
      const row = await createOtpRequest({
        jobId: jobRow.id,
        technicianId,
        customerName,
        overlay: showOverlay,
      });
      if (row) beginWatching(row);
      else setFailed(true);
    } catch {
      setFailed(true);
      toast.error('Could not send the OTP request. Run the OTP requests SQL script if this persists.');
    } finally {
      setStarting(false);
    }
  };

  useEffect(() => {
    if (!open || !job) {
      stopWatching();
      setRequest(null);
      setStoredOtp(null);
      setFailed(false);
      setShowOverlay(getTechPushOverlayPref());
      return;
    }
    // The OTP may already live on the job (entered at Start Work or during
    // completion) — show it straight away with zero extra queries or pushes.
    const existing = getStoredOtpFromRequirements((job as any).requirements);
    if (existing) {
      setStoredOtp(existing);
      return;
    }
    void ask(job, false);
    return stopWatching;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, job?.id]);

  const otp = request?.otp || storedOtp || null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader className="pr-10 text-left">
          <DialogTitle className="flex items-center gap-2">
            <KeyRound className="h-5 w-5" />
            Customer OTP
          </DialogTitle>
          <DialogDescription>
            {storedOtp && !request
              ? 'This code was already entered by the technician and is saved on the job.'
              : technicianName
                ? `${technicianName} has been asked to enter the customer's OTP.`
                : "The technician has been asked to enter the customer's OTP."}
          </DialogDescription>
        </DialogHeader>

        <label className="flex cursor-pointer items-start gap-2.5 rounded-md border px-3 py-2.5">
          <Checkbox
            checked={showOverlay}
            onCheckedChange={(v) => {
              const on = v === true;
              setShowOverlay(on);
              setTechPushOverlayPref(on);
            }}
            disabled={starting}
            className="mt-0.5"
          />
          <span className="text-xs text-muted-foreground leading-snug">
            <span className="font-medium text-foreground">Also show on-screen overlay</span>
            {' — '}Enter OTP on the card (same as notification). Applies on Ask again.
          </span>
        </label>

        {starting && (
          <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Sending request…
          </div>
        )}

        {!starting && failed && (
          <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
            The request could not be sent. Check that the technician is assigned and try again.
          </div>
        )}

        {!starting && !failed && !otp && (
          <div className="flex flex-col items-center gap-3 py-6">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground text-center">
              Waiting for the technician to enter the code…
              <br />
              You can close this — the code stays saved on the job.
            </p>
          </div>
        )}

        {!starting && otp && (
          <div className="flex flex-col items-center gap-4 py-4">
            <div className="text-4xl font-bold tracking-[0.4em] pl-[0.4em]">{otp}</div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  void navigator.clipboard.writeText(otp);
                  toast.success('OTP copied');
                }}
              >
                <Copy className="mr-2 h-4 w-4" />
                Copy
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => job && void ask(job, true)}
              >
                <RefreshCw className="mr-2 h-4 w-4" />
                Ask again
              </Button>
            </div>
            {request?.submitted_at && (
              <p className="text-xs text-muted-foreground">
                Entered {new Date(request.submitted_at).toLocaleString('en-IN', {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                })}
              </p>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default AskTechnicianOtpDialog;
