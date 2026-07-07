import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, ExternalLink } from 'lucide-react';
import { db } from '@/lib/supabase';
import { getLeadSourceFromJob } from '@/lib/adminUtils';
import {
  matchesTrendDrilldownJob,
  periodKeyToDateRange,
  type TrendDrilldownFilterArgs,
} from '@/lib/analyticsDashboard';
import { getJobCompletedAt, resolveJobBillingAmount } from '@/lib/jobAnalytics';

type TrendPeriodDrilldownDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  periodKey: string | null;
  periodLabel: string | null;
  filters: TrendDrilldownFilterArgs;
};

type DrilldownJob = {
  id: string;
  job_number?: string | null;
  payment_amount?: number | string | null;
  actual_cost?: number | string | null;
  payment_method?: string | null;
  service_sub_type?: string | null;
  assigned_technician_id?: string | null;
  technician?: { full_name?: string } | null;
  customer?: { full_name?: string; customer_id?: string } | null;
  completed_at?: string | null;
  end_time?: string | null;
  [key: string]: unknown;
};

function formatCurrency(amount: number): string {
  return amount.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

export function TrendPeriodDrilldownDialog({
  open,
  onOpenChange,
  periodKey,
  periodLabel,
  filters,
}: TrendPeriodDrilldownDialogProps) {
  const [loading, setLoading] = useState(false);
  const [jobs, setJobs] = useState<DrilldownJob[]>([]);
  const [error, setError] = useState<string | null>(null);

  const loadJobs = useCallback(async () => {
    if (!periodKey) return;
    const range = periodKeyToDateRange(periodKey);
    if (!range) {
      setError('Could not resolve this period.');
      setJobs([]);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const { data, error: fetchError } = await db.jobs.getCompletedJobsForTrendDrilldown(
        range.startDate,
        range.endDate
      );
      if (fetchError) {
        setError('Failed to load jobs for this period.');
        setJobs([]);
        return;
      }
      const filtered = (data || []).filter((job) =>
        matchesTrendDrilldownJob(job as Record<string, unknown>, filters)
      );
      filtered.sort((a, b) => {
        const aAt = getJobCompletedAt(a)?.getTime() ?? 0;
        const bAt = getJobCompletedAt(b)?.getTime() ?? 0;
        return bAt - aAt;
      });
      setJobs(filtered as DrilldownJob[]);
    } finally {
      setLoading(false);
    }
  }, [periodKey, filters]);

  useEffect(() => {
    if (!open || !periodKey) return;
    void loadJobs();
  }, [open, periodKey, loadJobs]);

  const totalRevenue = jobs.reduce(
    (sum, job) => sum + resolveJobBillingAmount(job.payment_amount, job.actual_cost),
    0
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col gap-0 p-0">
        <DialogHeader className="px-6 pt-6 pb-3 border-b shrink-0">
          <DialogTitle>Completed jobs — {periodLabel ?? periodKey}</DialogTitle>
          <DialogDescription>
            {loading
              ? 'Loading jobs…'
              : `${jobs.length} job${jobs.length === 1 ? '' : 's'} · ₹ ${formatCurrency(totalRevenue)} revenue`}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 py-4 min-h-0">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin" />
              Loading jobs…
            </div>
          ) : error ? (
            <p className="text-sm text-red-600 text-center py-10">{error}</p>
          ) : jobs.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-10">
              No completed jobs for this period with the current filters.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-xl border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Job</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Service</TableHead>
                    <TableHead>Technician</TableHead>
                    <TableHead>Lead</TableHead>
                    <TableHead className="text-right">Revenue</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {jobs.map((job) => {
                    const revenue = resolveJobBillingAmount(job.payment_amount, job.actual_cost);
                    const search = job.job_number || job.id;
                    return (
                      <TableRow key={job.id}>
                        <TableCell className="font-medium whitespace-nowrap">
                          <Link
                            to={`/admin?search=${encodeURIComponent(String(search))}`}
                            className="inline-flex items-center gap-1 text-sky-700 hover:underline"
                          >
                            {job.job_number || job.id.slice(0, 8)}
                            <ExternalLink className="w-3 h-3 opacity-60" />
                          </Link>
                        </TableCell>
                        <TableCell className="max-w-[140px] truncate">
                          {job.customer?.full_name || '—'}
                        </TableCell>
                        <TableCell className="max-w-[120px] truncate text-muted-foreground">
                          {job.service_sub_type || '—'}
                        </TableCell>
                        <TableCell className="max-w-[120px] truncate text-muted-foreground">
                          {job.technician?.full_name || '—'}
                        </TableCell>
                        <TableCell className="max-w-[120px] truncate text-muted-foreground">
                          {getLeadSourceFromJob(job)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-emerald-700 whitespace-nowrap">
                          ₹ {formatCurrency(revenue)}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
