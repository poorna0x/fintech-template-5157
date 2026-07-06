import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  ArrowLeftRight,
  Check,
  ChevronsUpDown,
  Clock,
  Loader2,
  MapPin,
  Navigation,
  RefreshCw,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { db } from '@/lib/supabase';
import { resolveJobLatLngFromRow } from '@/lib/jobLocationHelpers';
import { calculateDrivingDistance } from '@/lib/googleMapsDistance';
import { toast } from 'sonner';
import type { Job } from '@/types';

type JobRow = Job | Record<string, unknown>;

const ONGOING_JOB_STATUSES = new Set(['PENDING', 'ASSIGNED', 'EN_ROUTE', 'IN_PROGRESS']);

function isOngoingJob(job: JobRow): boolean {
  const status = String((job as any).status || (job as Job).status || '').toUpperCase();
  return ONGOING_JOB_STATUSES.has(status);
}

interface MeasureDistanceToolDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Ongoing jobs already on the dashboard — avoids an extra fetch when available. */
  initialJobs?: JobRow[];
}

type DistanceResult = {
  fromLabel: string;
  toLabel: string;
  distance: string;
  duration: string;
  isApproximate?: boolean;
};

function customerNameOf(job: JobRow): string {
  const cust = (job as any).customer;
  return String(cust?.full_name || cust?.fullName || 'Customer').trim() || 'Customer';
}

function jobNumberOf(job: JobRow): string {
  return String((job as any).job_number || (job as Job).jobNumber || '').trim();
}

/** Customer "Location" field (`visible_address`) — one-word identifier from add/edit customer form. */
function getJobLocationWord(job: JobRow): string {
  const cust = (job as any).customer;
  const customerAddress =
    typeof cust?.address === 'object' && cust?.address ? cust.address : {};
  const serviceAddress = (job as any).service_address || (job as Job).serviceAddress || {};

  const raw =
    cust?.visible_address ||
    cust?.visibleAddress ||
    customerAddress?.visible_address ||
    customerAddress?.visibleAddress ||
    serviceAddress?.visible_address ||
    serviceAddress?.visibleAddress ||
    '';

  return String(raw).replace(/[\s\u00a0\u2000-\u200B\uFEFF]+/g, ' ').trim();
}

function formatJobStopLabel(job: JobRow): string {
  const name = customerNameOf(job);
  const loc = getJobLocationWord(job);
  return loc ? `${name} (${loc})` : `${name} (—)`;
}

function jobSearchHaystack(job: JobRow): string {
  return [jobNumberOf(job), customerNameOf(job), getJobLocationWord(job)].join(' ').toLowerCase();
}

function mergeJobsIntoMap(prev: Map<string, JobRow>, rows: JobRow[]): Map<string, JobRow> {
  if (!rows.length) return prev;
  const next = new Map(prev);
  for (const row of rows) {
    if (!isOngoingJob(row)) continue;
    const id = String((row as any).id || '');
    if (id) next.set(id, row);
  }
  return next;
}

interface JobStopPickerProps {
  id: string;
  label: string;
  value: string;
  disabled?: boolean;
  jobsById: Map<string, JobRow>;
  options: JobRow[];
  search: string;
  onSearchChange: (value: string) => void;
  onSelect: (jobId: string) => void;
}

function JobStopPicker({
  id,
  label,
  value,
  disabled,
  jobsById,
  options,
  search,
  onSearchChange,
  onSelect,
}: JobStopPickerProps) {
  const [open, setOpen] = useState(false);
  const selected = value ? jobsById.get(value) : undefined;
  const display = selected ? formatJobStopLabel(selected) : 'Search customer or location…';

  return (
    <div className="space-y-1.5 min-w-0">
      <Label htmlFor={id}>{label}</Label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            id={id}
            variant="outline"
            role="combobox"
            aria-expanded={open}
            disabled={disabled}
            className="w-full justify-between font-normal h-11"
          >
            <span className="truncate text-left flex-1">{display}</span>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="w-[var(--radix-popover-trigger-width)] max-w-[calc(100vw-1.5rem)] p-0 z-[60]"
          align="start"
          sideOffset={4}
        >
          <Command shouldFilter={false}>
            <CommandInput
              placeholder="Customer or location…"
              value={search}
              onValueChange={onSearchChange}
              className="h-11 text-sm"
            />
            <CommandList className="max-h-[min(280px,50vh)]">
              <CommandEmpty className="py-6 text-center text-sm text-muted-foreground">
                No ongoing jobs found. Try customer name or location.
              </CommandEmpty>
              <CommandGroup>
                {options.map((job) => {
                      const jobId = String((job as any).id);
                      return (
                        <CommandItem
                          key={jobId}
                          value={jobId}
                          onSelect={() => {
                            onSelect(jobId);
                            setOpen(false);
                            onSearchChange('');
                          }}
                          className="flex items-start gap-2 px-3 py-2.5 cursor-pointer"
                        >
                          <Check
                            className={cn(
                              'h-4 w-4 shrink-0 mt-0.5',
                              value === jobId ? 'opacity-100' : 'opacity-0'
                            )}
                          />
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-medium truncate">
                              {formatJobStopLabel(job)}
                            </div>
                          </div>
                        </CommandItem>
                      );
                    })}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}

const MeasureDistanceToolDialog: React.FC<MeasureDistanceToolDialogProps> = ({
  open,
  onOpenChange,
  initialJobs = [],
}) => {
  const [jobsById, setJobsById] = useState<Map<string, JobRow>>(() =>
    mergeJobsIntoMap(new Map(), initialJobs)
  );
  const [loadingJobs, setLoadingJobs] = useState(false);
  const [fromJobId, setFromJobId] = useState('');
  const [toJobId, setToJobId] = useState('');
  const [fromSearch, setFromSearch] = useState('');
  const [toSearch, setToSearch] = useState('');
  const [calculating, setCalculating] = useState(false);
  const [result, setResult] = useState<DistanceResult | null>(null);

  const resetForm = useCallback(() => {
    setFromJobId('');
    setToJobId('');
    setFromSearch('');
    setToSearch('');
    setResult(null);
    setCalculating(false);
  }, []);

  const initialJobsRef = useRef(initialJobs);
  initialJobsRef.current = initialJobs;

  useEffect(() => {
    if (!open) {
      resetForm();
      return;
    }

    setJobsById((prev) => mergeJobsIntoMap(prev, initialJobsRef.current));

    let cancelled = false;
    (async () => {
      setLoadingJobs(true);
      try {
        const { data, error } = await db.jobs.getOngoing(200);
        if (cancelled) return;
        if (error) {
          toast.error('Could not load ongoing jobs');
          return;
        }
        setJobsById((prev) => mergeJobsIntoMap(prev, (data || []) as JobRow[]));
      } finally {
        if (!cancelled) setLoadingJobs(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, resetForm]);

  const buildOptions = useCallback(
    (localSearch: string): JobRow[] => {
      const q = localSearch.trim().toLowerCase();
      const all = Array.from(jobsById.values()).filter(isOngoingJob);
      const filtered = q
        ? all.filter((job) => jobSearchHaystack(job).includes(q))
        : all;

      return filtered.sort((a, b) => customerNameOf(a).localeCompare(customerNameOf(b)));
    },
    [jobsById]
  );

  const fromOptions = useMemo(() => buildOptions(fromSearch), [buildOptions, fromSearch]);
  const toOptions = useMemo(() => buildOptions(toSearch), [buildOptions, toSearch]);

  const swapStops = () => {
    setFromJobId(toJobId);
    setToJobId(fromJobId);
    setResult(null);
  };

  const handleCalculate = async () => {
    if (!fromJobId || !toJobId) {
      toast.error('Choose both From and To jobs.');
      return;
    }
    if (fromJobId === toJobId) {
      toast.error('From and To must be different jobs.');
      return;
    }

    const fromJob = jobsById.get(fromJobId);
    const toJob = jobsById.get(toJobId);
    if (!fromJob || !toJob) {
      toast.error('Selected job not found. Search again.');
      return;
    }

    setCalculating(true);
    setResult(null);

    let resolvingToast: string | number | undefined;
    try {
      const [fromResolved, toResolved] = await Promise.all([
        resolveJobLatLngFromRow(fromJob, {
          getJobByIdFull: db.jobs.getByIdFull,
          onResolvingLink: () => {
            if (resolvingToast === undefined) {
              resolvingToast = toast.loading('Resolving map links…');
            }
          },
        }),
        resolveJobLatLngFromRow(toJob, {
          getJobByIdFull: db.jobs.getByIdFull,
          onResolvingLink: () => {
            if (resolvingToast === undefined) {
              resolvingToast = toast.loading('Resolving map links…');
            }
          },
        }),
      ]);

      if (resolvingToast !== undefined) toast.dismiss(resolvingToast);

      if (!fromResolved || !toResolved) {
        toast.error('Map coordinates missing for one or both jobs. Check customer map links.');
        return;
      }

      const driving = await calculateDrivingDistance(
        { lat: fromResolved.lat, lng: fromResolved.lng },
        { lat: toResolved.lat, lng: toResolved.lng }
      );

      if (driving.isApproximate) {
        toast.warning('Showing approximate distance (route unavailable)');
      }

      setResult({
        fromLabel: formatJobStopLabel(fromJob),
        toLabel: formatJobStopLabel(toJob),
        distance: driving.distance,
        duration: driving.duration,
        isApproximate: driving.isApproximate,
      });
    } catch (error) {
      if (resolvingToast !== undefined) toast.dismiss(resolvingToast);
      toast.error(
        `Failed to calculate: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    } finally {
      setCalculating(false);
    }
  };

  const canCalculate =
    Boolean(fromJobId && toJobId && fromJobId !== toJobId) && !calculating && !loadingJobs;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto w-[calc(100vw-2rem)] sm:w-full">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Navigation className="h-5 w-5 shrink-0" />
            Measure distance
          </DialogTitle>
          <DialogDescription>
            Driving distance between ongoing jobs using Google Maps. Same list as the Ongoing section.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 min-w-0">
          {loadingJobs && jobsById.size === 0 ? (
            <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
              <RefreshCw className="h-5 w-5 animate-spin" />
              Loading jobs…
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr] gap-3 items-end">
                <JobStopPicker
                  id="measure-from-job"
                  label="From job"
                  value={fromJobId}
                  jobsById={jobsById}
                  options={fromOptions}
                  search={fromSearch}
                  onSearchChange={setFromSearch}
                  onSelect={(id) => {
                    setFromJobId(id);
                    setResult(null);
                  }}
                  disabled={calculating}
                />

                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-11 w-full sm:w-11 shrink-0"
                  onClick={swapStops}
                  disabled={calculating || (!fromJobId && !toJobId)}
                  title="Swap From and To"
                  aria-label="Swap From and To"
                >
                  <ArrowLeftRight className="h-4 w-4" />
                </Button>

                <JobStopPicker
                  id="measure-to-job"
                  label="To job"
                  value={toJobId}
                  jobsById={jobsById}
                  options={toOptions}
                  search={toSearch}
                  onSearchChange={setToSearch}
                  onSelect={(id) => {
                    setToJobId(id);
                    setResult(null);
                  }}
                  disabled={calculating}
                />
              </div>

              <Button
                type="button"
                className="w-full"
                disabled={!canCalculate}
                onClick={() => void handleCalculate()}
              >
                {calculating ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin shrink-0" />
                    Calculating…
                  </>
                ) : (
                  <>
                    <MapPin className="h-4 w-4 mr-2 shrink-0" />
                    Calculate driving distance
                  </>
                )}
              </Button>

              {result && (
                <div className="rounded-lg border border-sky-200 bg-sky-50/90 p-4 text-sm space-y-2">
                  <div className="font-medium text-foreground break-words">
                    {result.fromLabel}
                    <span className="text-muted-foreground mx-1.5">→</span>
                    {result.toLabel}
                  </div>
                  <div className="flex flex-wrap items-center gap-3 text-foreground">
                    <span className="text-lg font-semibold text-sky-800">{result.distance}</span>
                    {result.isApproximate && (
                      <span className="text-xs text-muted-foreground italic">
                        approximate (straight-line)
                      </span>
                    )}
                    {result.duration ? (
                      <span className="flex items-center gap-1.5 text-muted-foreground">
                        <Clock className="h-4 w-4 shrink-0" />
                        {result.duration}
                      </span>
                    ) : null}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        <DialogFooter className="flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default MeasureDistanceToolDialog;
