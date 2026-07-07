import { useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabaseClient';
import type { AdminStatusFilter } from '@/lib/adminDashboardCache';

type JobCounts = {
  ongoing?: number;
  followup?: number;
  denied?: number;
  completed?: number;
};

type LoadFilteredJobs = (
  filter: AdminStatusFilter,
  page?: number,
  opts?: { silent?: boolean; cacheOnly?: boolean }
) => Promise<void>;

export function useAdminJobsRealtime({
  isInitialLoad,
  isPollingEnabled,
  statusFilter,
  currentPage,
  loadFilteredJobs,
  loadJobCounts,
  playCompletedJobSound,
  setLastCheckedJobId,
  setJobCounts,
  setCustomerPriorServiceStatus,
  jobIdsCompletedByAdminRef,
  onRealtimeResubscribed,
}: {
  isInitialLoad: boolean;
  isPollingEnabled: boolean;
  statusFilter: AdminStatusFilter;
  currentPage: number;
  loadFilteredJobs: LoadFilteredJobs;
  loadJobCounts: () => Promise<void>;
  playCompletedJobSound: () => Promise<void>;
  setLastCheckedJobId: React.Dispatch<React.SetStateAction<string | null>>;
  setJobCounts: React.Dispatch<React.SetStateAction<JobCounts>>;
  setCustomerPriorServiceStatus: React.Dispatch<
    React.SetStateAction<Record<string, boolean>>
  >;
  jobIdsCompletedByAdminRef: React.MutableRefObject<Set<string>>;
  onRealtimeResubscribed: () => void | Promise<void>;
}) {
  const adminRealtimeStatusRef = useRef<string | null>(null);
  const onRealtimeResubscribedRef = useRef(onRealtimeResubscribed);
  onRealtimeResubscribedRef.current = onRealtimeResubscribed;

  useEffect(() => {
    if (isInitialLoad) return;

    const seedCompletedIds = async () => {
      try {
        const { data: rows, error } = await supabase
          .from('jobs')
          .select('id')
          .eq('status', 'COMPLETED')
          .order('created_at', { ascending: false })
          .limit(15);
        if (!error && rows?.length) {
          rows.forEach((j: { id: string }) =>
            jobIdsCompletedByAdminRef.current.add(j.id)
          );
        }
      } catch {
        // ignore
      }
    };
    const seedTimeout = setTimeout(seedCompletedIds, 2000);

    let channel = supabase.channel('admin-jobs-realtime');
    if (isPollingEnabled) {
      channel = channel.on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'jobs' },
        (payload: { new: Record<string, unknown> }) => {
          const row = payload.new as { id: string; status?: string };
          if (row.id) setLastCheckedJobId(row.id);
          const status = (row.status || 'PENDING') as string;
          if (['PENDING', 'ASSIGNED', 'EN_ROUTE', 'IN_PROGRESS'].includes(status)) {
            setJobCounts((prev) => ({ ...prev, ongoing: (prev.ongoing || 0) + 1 }));
          }
          loadFilteredJobs(statusFilter, 1);
        }
      );
    }
    channel
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'jobs',
          filter: 'status=eq.COMPLETED',
        },
        (payload: { new: Record<string, unknown> }) => {
          const row = payload.new as {
            id: string;
            customer_id?: string | null;
            completed_at?: string | null;
            end_time?: string | null;
          };
          if (row.customer_id) {
            setCustomerPriorServiceStatus((prev) =>
              prev[row.customer_id as string]
                ? prev
                : { ...prev, [row.customer_id as string]: true }
            );
          }
          if (jobIdsCompletedByAdminRef.current.has(row.id)) return;
          const completedAt = row.completed_at || row.end_time;
          if (completedAt) {
            const t = new Date(completedAt).getTime();
            if (Date.now() - t > 60000) return;
          }
          jobIdsCompletedByAdminRef.current.add(row.id);
          playCompletedJobSound();
          void loadJobCounts();
          if (statusFilter === 'COMPLETED') {
            void loadFilteredJobs('COMPLETED', currentPage, { silent: true });
          } else {
            void loadFilteredJobs('COMPLETED', 1, { silent: true, cacheOnly: true });
            if (statusFilter === 'ONGOING') {
              void loadFilteredJobs('ONGOING', 1, { silent: true });
            }
          }
        }
      )
      .subscribe((status) => {
        const prev = adminRealtimeStatusRef.current;
        adminRealtimeStatusRef.current = status;
        if (status === 'SUBSCRIBED' && prev != null && prev !== 'SUBSCRIBED') {
          void onRealtimeResubscribedRef.current();
        }
      });

    return () => {
      clearTimeout(seedTimeout);
      supabase.removeChannel(channel);
    };
  }, [
    isInitialLoad,
    isPollingEnabled,
    statusFilter,
    currentPage,
    loadFilteredJobs,
    loadJobCounts,
    playCompletedJobSound,
    setLastCheckedJobId,
    setJobCounts,
    setCustomerPriorServiceStatus,
    jobIdsCompletedByAdminRef,
  ]);
}
