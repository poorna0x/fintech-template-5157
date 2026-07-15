import { useCallback, useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';
import { KeyRound, Loader2, Send } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import {
  getPendingOtpRequests,
  submitOtp,
  type OtpRequestRow,
} from '@/lib/technicianOtpRequests';
import type { Job } from '@/types';

type TechnicianOtpRequestCardProps = {
  technicianId: string;
  jobs: Job[];
};

/**
 * Shows when the office has asked for the customer's OTP (Home Triangle
 * jobs). Fetched on load and whenever the app returns to the foreground
 * (e.g. after tapping the push notification). While a request is visible,
 * a realtime watch removes it the moment it's answered — including when
 * the technician replies from the notification instead of here.
 */
const TechnicianOtpRequestCard = ({ technicianId, jobs }: TechnicianOtpRequestCardProps) => {
  const [requests, setRequests] = useState<OtpRequestRow[]>([]);
  const [codes, setCodes] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!technicianId) return;
    try {
      setRequests(await getPendingOtpRequests(technicianId));
    } catch {
      // Table may not exist yet; stay hidden.
    }
  }, [technicianId]);

  useEffect(() => {
    void refresh();
    const onVisible = () => {
      if (!document.hidden) void refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [refresh]);

  // Only while a request card is on screen: drop it live once it's answered
  // anywhere (notification reply or another device). No channel otherwise.
  const hasPending = requests.length > 0;
  useEffect(() => {
    if (!hasPending || !technicianId) return;
    const channel = supabase
      .channel(`otp-pending-${technicianId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'technician_otp_requests',
          filter: `technician_id=eq.${technicianId}`,
        },
        (payload) => {
          const next = payload.new as OtpRequestRow | undefined;
          if (next?.otp) {
            setRequests((prev) => prev.filter((r) => r.id !== next.id));
          }
        }
      )
      .subscribe();
    return () => void supabase.removeChannel(channel);
  }, [hasPending, technicianId]);

  if (!hasPending) return null;

  const handleSubmit = async (request: OtpRequestRow) => {
    const code = (codes[request.id] || '').trim();
    if (!/^\d{4}$/.test(code)) {
      toast.error('Enter the 4-digit code');
      return;
    }
    setSubmitting(request.id);
    try {
      const ok = await submitOtp(request.id, code);
      if (ok) {
        toast.success('OTP sent to the office');
        setRequests((prev) => prev.filter((r) => r.id !== request.id));
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
