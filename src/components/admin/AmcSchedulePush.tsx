import React, { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { DatePicker } from '@/components/ui/date-picker';
import { db, supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import {
  getDefaultAmcServicePeriodMonths,
  nextAmcYearServiceDate,
  planAmcNextVisit,
  toDateOnly,
} from '@/lib/amcAutoJobSchedule';
import { notifyTechnicianAfterJobEdit } from '@/lib/notifyTechJobEdit';
import { getLocalCalendarDateYmd } from '@/lib/pendingPaymentReminder';

type AmcSchedulePushProps = {
  contractId: string;
  customerId: string;
  customerName: string;
  startDate: string;
  endDate: string;
  nextServiceOn?: string | null;
  servicePeriodMonths?: number | null;
  onUpdated?: (nextServiceOn: string | null) => void;
};

function formatVisitDate(dateStr: string): string {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

/** Change the next AMC visit date. Used from AMC records and customer AMC Info. */
export default function AmcSchedulePush({
  contractId,
  customerId,
  customerName,
  startDate,
  endDate,
  nextServiceOn,
  servicePeriodMonths,
  onUpdated,
}: AmcSchedulePushProps) {
  const start = toDateOnly(startDate) || '';
  const end = toDateOnly(endDate) || '';
  const savedPin = toDateOnly(nextServiceOn);
  const period =
    servicePeriodMonths != null ? servicePeriodMonths : getDefaultAmcServicePeriodMonths();
  const todayStr = getLocalCalendarDateYmd();
  const active = Boolean(end && end >= todayStr);

  const [pinned, setPinned] = useState<string | null>(savedPin);
  const [pushDate, setPushDate] = useState<string | undefined>(savedPin || undefined);
  const [pushing, setPushing] = useState(false);
  const [lastCompleted, setLastCompleted] = useState<string | null>(null);

  useEffect(() => {
    setPinned(savedPin);
    setPushDate(savedPin || end || undefined);
  }, [contractId, savedPin, end]);

  useEffect(() => {
    if (!customerId) return;
    let cancel = false;
    void supabase
      .from('jobs')
      .select('completed_at')
      .eq('customer_id', customerId)
      .eq('status', 'COMPLETED')
      .not('completed_at', 'is', null)
      .order('completed_at', { ascending: false })
      .limit(1)
      .then(({ data }) => {
        if (cancel) return;
        setLastCompleted(toDateOnly(data?.[0]?.completed_at));
      });
    return () => {
      cancel = true;
    };
  }, [customerId]);

  if (!active || period <= 0 || !start) return null;

  const reference = lastCompleted && lastCompleted > start ? lastCompleted : start;
  const plan = planAmcNextVisit({
    startDate: start,
    endDate: end,
    periodMonths: period,
    referenceDate: reference,
    pushedDate: pinned,
    today: todayStr,
  });
  const yearServiceDate = nextAmcYearServiceDate(start, end, todayStr);

  const pushVisit = async (date: string | null) => {
    if (pushing) return;
    if (date && date < todayStr) {
      toast.error('Pick today or a later date');
      return;
    }
    if (date && end) {
      const latest = new Date(end + 'T12:00:00');
      latest.setDate(latest.getDate() + 14);
      if (date > getLocalCalendarDateYmd(latest)) {
        toast.error('That date is after this AMC ends. Use the AMC end date, or a day close to it.');
        return;
      }
    }

    setPushing(true);
    try {
      const { error: updateError } = await db.amcContracts.update(contractId, {
        next_service_on: date,
      });
      if (updateError) throw updateError;

      const openStatuses = ['PENDING', 'ASSIGNED', 'EN_ROUTE', 'IN_PROGRESS', 'FOLLOW_UP', 'RESCHEDULED'];
      const { data: openJobs, error: jobsError } = await supabase
        .from('jobs')
        .select('id, scheduled_date, scheduled_time_slot, description, assigned_technician_id, service_type, service_sub_type')
        .eq('customer_id', customerId)
        .eq('service_sub_type', 'AMC Service')
        .in('status', openStatuses);
      if (jobsError) throw jobsError;

      if (date && openJobs && openJobs.length > 0) {
        for (const job of openJobs) {
          const previousDate = toDateOnly(job.scheduled_date) || '';
          if (previousDate === date) continue;
          const { error: jobError } = await supabase
            .from('jobs')
            .update({ scheduled_date: date })
            .eq('id', job.id);
          if (jobError) throw jobError;
          notifyTechnicianAfterJobEdit({
            jobId: job.id,
            technicianId: job.assigned_technician_id,
            customerName,
            before: {
              description: job.description || '',
              cost_agreed: '',
              scheduledDate: previousDate,
              scheduledTimeSlot: job.scheduled_time_slot || 'MORNING',
              scheduledTimeCustom: '',
              serviceType: job.service_type || 'RO',
              serviceSubType: job.service_sub_type || 'AMC Service',
            },
            after: {
              description: job.description || '',
              cost_agreed: '',
              scheduledDate: date,
              scheduledTimeSlot: job.scheduled_time_slot || 'MORNING',
              scheduledTimeCustom: '',
              serviceType: job.service_type || 'RO',
              serviceSubType: job.service_sub_type || 'AMC Service',
            },
          });
        }
      }

      const windowEnd = new Date(todayStr + 'T12:00:00');
      windowEnd.setDate(windowEnd.getDate() + 10);
      const windowOpen = Boolean(date && date <= getLocalCalendarDateYmd(windowEnd));
      if (date && windowOpen && (!openJobs || openJobs.length === 0)) {
        await db.amcContracts.createAMCServiceJobs({ force: true, onlyCustomerId: customerId });
      }

      setPinned(date);
      setPushDate(date || end || undefined);
      onUpdated?.(date);
      const movedOpenJob = Boolean(date && openJobs && openJobs.length > 0);
      toast.success(
        date
          ? movedOpenJob
            ? `Next visit pushed to ${formatVisitDate(date)}. The open AMC job was moved to that date.`
            : `Next visit pushed to ${formatVisitDate(date)}`
          : openJobs && openJobs.length > 0
            ? 'Later visits are back on the automatic dates. The open AMC job stays on its current date.'
            : 'Next visit is back on the automatic dates',
      );
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      toast.error('Could not update the next visit: ' + message);
    } finally {
      setPushing(false);
    }
  };

  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50/80 p-3 space-y-2.5">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-sm font-medium text-gray-900">Next visit</p>
        {plan.nextDue && (
          <p className="text-sm text-gray-600 tabular-nums">{formatVisitDate(plan.nextDue)}</p>
        )}
      </div>
      <DatePicker
        value={pushDate}
        onChange={setPushDate}
        placeholder="Visit date"
        disabled={pushing}
      />
      <div className="flex flex-wrap gap-1.5">
        <Button
          type="button"
          size="sm"
          className="h-8"
          disabled={pushing || !pushDate}
          onClick={() => pushDate && void pushVisit(pushDate)}
        >
          {pushing ? 'Saving…' : 'Set this date'}
        </Button>
        {yearServiceDate && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-8 bg-white"
            disabled={pushing}
            onClick={() => void pushVisit(yearServiceDate)}
          >
            1 year · {formatVisitDate(yearServiceDate)}
          </Button>
        )}
        {end && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-8 bg-white"
            disabled={pushing}
            onClick={() => void pushVisit(end)}
          >
            AMC end
          </Button>
        )}
        {pinned && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-8"
            disabled={pushing}
            onClick={() => void pushVisit(null)}
          >
            Automatic
          </Button>
        )}
      </div>
      <p className="text-xs text-gray-500">The job opens 10 days before this date.</p>
    </div>
  );
}
