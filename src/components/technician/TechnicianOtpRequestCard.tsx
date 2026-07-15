import { useCallback, useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { KeyRound, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
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
 * (e.g. after tapping the push notification) — no standing connection.
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

  if (requests.length === 0) return null;

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
        return (
          <Card key={request.id} className="border-amber-300 bg-amber-50">
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <KeyRound className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-amber-900">
                    Office needs the customer's OTP
                    {customerName ? ` — ${customerName}` : ''}
                  </p>
                  <p className="text-sm text-amber-700 mb-3">
                    Ask the customer for their 4-digit code and enter it here.
                  </p>
                  <div className="flex gap-2">
                    <Input
                      inputMode="numeric"
                      pattern="[0-9]*"
                      maxLength={4}
                      placeholder="4-digit code"
                      className="w-32 bg-white text-center text-lg tracking-widest"
                      value={codes[request.id] || ''}
                      onChange={(e) =>
                        setCodes((prev) => ({
                          ...prev,
                          [request.id]: e.target.value.replace(/\D/g, '').slice(0, 4),
                        }))
                      }
                    />
                    <Button
                      onClick={() => void handleSubmit(request)}
                      disabled={submitting === request.id || (codes[request.id] || '').length !== 4}
                      className="bg-amber-600 hover:bg-amber-700"
                    >
                      {submitting === request.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        'Send'
                      )}
                    </Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
};

export default TechnicianOtpRequestCard;
