import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';
import { KeyRound, Loader2, Send } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import {
  getPendingOtpRequests,
  getStoredOtpFromRequirements,
  submitOtp,
  type OtpRequestRow,
} from '@/lib/technicianOtpRequests';
import type { Job } from '@/types';

type TechnicianOtpRequestCardProps = {
  technicianId: string;
  jobs: Job[];
  /** Patch parent job list so Start Work sees OTP already entered. */
  onOtpSubmitted?: (jobId: string, otp: string) => void;
};

/**
 * Shows when the office has asked for the customer's OTP (Home Triangle /
 * Require OTP jobs). Fetched on load and whenever the app returns to the
 * foreground (e.g. after tapping the push notification). While a request is
 * visible, realtime + short polling remove it the moment it's answered —
 * including when the technician replies from the notification / overlay
 * instead of here.
 */
const TechnicianOtpRequestCard = ({
  technicianId,
  jobs,
  onOtpSubmitted,
}: TechnicianOtpRequestCardProps) => {
  const [requests, setRequests] = useState<OtpRequestRow[]>([]);
  const [codes, setCodes] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState<string | null>(null);
  const onOtpSubmittedRef = useRef(onOtpSubmitted);
  onOtpSubmittedRef.current = onOtpSubmitted;
  const syncedJobIdsRef = useRef<Set<string>>(new Set());

  const jobOtpById = useMemo(() => {
    const map = new Map<string, string>();
    for (const job of jobs) {
      const otp = getStoredOtpFromRequirements(
        (job as any).requirements ?? job.requirements
      );
      if (otp && /^\d{4}$/.test(otp)) map.set(job.id, otp);
    }
    return map;
  }, [jobs]);

  const notifySubmitted = useCallback((jobId: string, otp: string) => {
    if (syncedJobIdsRef.current.has(jobId)) return;
    syncedJobIdsRef.current.add(jobId);
    onOtpSubmittedRef.current?.(jobId, otp);
  }, []);

  const pruneAnswered = useCallback(
    (rows: OtpRequestRow[]): OtpRequestRow[] => {
      const kept: OtpRequestRow[] = [];
      for (const row of rows) {
        const rowOtp =
          typeof row.otp === 'string' && /^\d{4}$/.test(row.otp.trim())
            ? row.otp.trim()
            : null;
        if (rowOtp) {
          notifySubmitted(row.job_id, rowOtp);
          continue;
        }
        const fromJob = jobOtpById.get(row.job_id);
        if (fromJob) {
          notifySubmitted(row.job_id, fromJob);
          continue;
        }
        kept.push(row);
      }
      return kept;
    },
    [jobOtpById, notifySubmitted]
  );

  const refresh = useCallback(async () => {
    if (!technicianId) return;
    try {
      const pending = await getPendingOtpRequests(technicianId);
      setRequests((prev) => {
        const next = pruneAnswered(pending);
        if (
          next.length === prev.length &&
          next.every((r, i) => r.id === prev[i]?.id)
        ) {
          return prev;
        }
        return next;
      });
    } catch {
      // Table may not exist yet; stay hidden.
    }
  }, [technicianId, pruneAnswered]);

  useEffect(() => {
    void refresh();
    const onVisible = () => {
      if (!document.hidden) void refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [refresh]);

  // OTP already on the job (Start Work) — drop matching Ask OTP cards immediately.
  useEffect(() => {
    if (jobOtpById.size === 0) return;
    setRequests((prev) => {
      if (prev.length === 0) return prev;
      const next = pruneAnswered(prev);
      if (
        next.length === prev.length &&
        next.every((r, i) => r.id === prev[i]?.id)
      ) {
        return prev;
      }
      return next;
    });
  }, [jobOtpById, pruneAnswered]);

  const pendingIds = useMemo(
    () =>
      requests
        .map((r) => r.id)
        .sort()
        .join(','),
    [requests]
  );
  const hasPending = requests.length > 0;

  // Realtime: filter by request id (PK) so UPDATE events aren't dropped.
  // technician_id filters need REPLICA IDENTITY FULL; id works with default.
  useEffect(() => {
    if (!hasPending || !technicianId || !pendingIds) return;
    const ids = pendingIds.split(',');
    const channel = supabase.channel(`otp-pending-${technicianId}-${pendingIds}`);

    for (const id of ids) {
      channel.on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'technician_otp_requests',
          filter: `id=eq.${id}`,
        },
        (payload) => {
          const next = payload.new as OtpRequestRow | undefined;
          if (!next?.otp) return;
          const otp = String(next.otp).trim();
          setRequests((prev) => prev.filter((r) => r.id !== next.id));
          if (/^\d{4}$/.test(otp)) {
            notifySubmitted(next.job_id, otp);
          }
        }
      );
    }

    channel.subscribe();
    return () => void supabase.removeChannel(channel);
  }, [hasPending, technicianId, pendingIds, notifySubmitted]);

  // Poll while a card is showing — covers missed realtime (overlay / notification).
  useEffect(() => {
    if (!hasPending) return;
    const timer = window.setInterval(() => {
      void refresh();
    }, 4000);
    return () => window.clearInterval(timer);
  }, [hasPending, refresh]);

  if (!hasPending) return null;

  const handleSubmit = async (request: OtpRequestRow) => {
    const code = (codes[request.id] || '').trim();
    if (!/^\d{4}$/.test(code)) {
      toast.error('Enter the 4-digit code');
      return;
    }
    setSubmitting(request.id);
    try {
      const ok = await submitOtp(request.id, code, request.job_id);
      if (ok) {
        toast.success('OTP sent to the office');
        setRequests((prev) => prev.filter((r) => r.id !== request.id));
        notifySubmitted(request.job_id, code);
      } else {
        toast.error('Could not send the OTP. Try again.');
      }
    } finally {
      setSubmitting(null);
    }
  };

  return (
    <div className="space-y-3 mb-6">
      {requests.map((request) => {
        const job = jobs.find((j) => j.id === request.job_id);
        const customerName =
          ((job?.customer as any)?.full_name as string) ||
          ((job?.customer as any)?.fullName as string) ||
          null;
        const code = codes[request.id] || '';
        const isSubmitting = submitting === request.id;
        return (
          <Card
            key={request.id}
            className="border-amber-200 bg-gradient-to-br from-amber-50 to-orange-50 shadow-sm overflow-hidden"
          >
            <CardContent className="p-4 sm:p-5">
              {/* Header */}
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-100">
                  <KeyRound className="h-5 w-5 text-amber-600" />
                </div>
                <div className="min-w-0">
                  <p className="font-semibold text-amber-900 leading-tight">
                    OTP needed{customerName ? ` — ${customerName}` : ''}
                  </p>
                  <p className="text-sm text-amber-700">
                    Ask the customer for their 4-digit code
                  </p>
                </div>
              </div>

              {/* Code boxes + send: stacked and centered on mobile, inline on wide screens */}
              <div className="mt-4 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
                <InputOTP
                  maxLength={4}
                  value={code}
                  inputMode="numeric"
                  pattern="^\d+$"
                  onChange={(value) =>
                    setCodes((prev) => ({
                      ...prev,
                      [request.id]: value.replace(/\D/g, ''),
                    }))
                  }
                  disabled={isSubmitting}
                >
                  <InputOTPGroup className="gap-2">
                    {[0, 1, 2, 3].map((i) => (
                      <InputOTPSlot
                        key={i}
                        index={i}
                        className="h-12 w-12 rounded-lg border border-amber-300 bg-white text-lg font-semibold text-amber-900 shadow-sm first:rounded-l-lg last:rounded-r-lg"
                      />
                    ))}
                  </InputOTPGroup>
                </InputOTP>
                <Button
                  onClick={() => void handleSubmit(request)}
                  disabled={isSubmitting || code.length !== 4}
                  className="h-11 w-full bg-amber-600 hover:bg-amber-700 sm:w-auto sm:px-6"
                >
                  {isSubmitting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      <Send className="mr-2 h-4 w-4" />
                      Send to office
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
};

export default TechnicianOtpRequestCard;
