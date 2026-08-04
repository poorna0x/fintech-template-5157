import React, { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ChevronLeft, Pencil } from 'lucide-react';
import { db } from '@/lib/supabase';
import { toast } from 'sonner';
import { inventoryCache } from '@/lib/inventoryCache';

interface InventoryItem {
  id: string;
  product_name: string;
  code: string | null;
  price: number;
  quantity: number;
}

export interface TechnicianTopUpDialogProps {
  technicianId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

const toDateKey = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

type TopUpItem = {
  inventory_id: string;
  quantity_used: number;
  last_used_at: string;
  inventory?: { id: string; product_name: string; code: string | null };
};

type TopUpJobGroup = {
  job_id: string;
  job_number: string | null;
  customer_name: string | null;
  completed_at: string;
  topUpItems: TopUpItem[];
};

/** all = classic aggregated queue; jobs = pick a job; job-topup = Add/Skip for one job */
type ViewMode = 'all' | 'jobs' | 'job-topup';

const unwrap = <T,>(value: T | T[] | null | undefined): T | null => {
  if (value == null) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
};

const TechnicianTopUpDialog: React.FC<TechnicianTopUpDialogProps> = ({
  technicianId,
  open,
  onOpenChange,
  onSuccess,
}) => {
  const [viewMode, setViewMode] = useState<ViewMode>('all');
  const [allTopUpItems, setAllTopUpItems] = useState<TopUpItem[]>([]);
  const [jobGroups, setJobGroups] = useState<TopUpJobGroup[]>([]);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [jobTopUpItems, setJobTopUpItems] = useState<TopUpItem[]>([]);
  const [currentTopUpIndex, setCurrentTopUpIndex] = useState(0);
  const [topUpLoading, setTopUpLoading] = useState(false);
  const [editableTopUpQty, setEditableTopUpQty] = useState<string>('');
  const [isTopUpQtyEditing, setIsTopUpQtyEditing] = useState(false);
  const [topUpLastWorkingDayLabel, setTopUpLastWorkingDayLabel] = useState<string>('');
  const [mainInventory, setMainInventory] = useState<InventoryItem[]>([]);
  const topUpQtyInputRef = useRef<HTMLInputElement>(null);

  const selectedJob = selectedJobId
    ? jobGroups.find((j) => j.job_id === selectedJobId) ?? null
    : null;

  const activeQueue = viewMode === 'job-topup' ? jobTopUpItems : allTopUpItems;
  const currentItem =
    activeQueue.length > 0 && currentTopUpIndex < activeQueue.length
      ? activeQueue[currentTopUpIndex]
      : null;

  const loadMainInventory = async () => {
    const mainRes = await db.inventory.getAll();
    if (mainRes.data) setMainInventory(mainRes.data);
  };

  useEffect(() => {
    if (!open || !technicianId) return;
    let cancelled = false;
    const run = async () => {
      setTopUpLoading(true);
      setViewMode('all');
      setSelectedJobId(null);
      setJobTopUpItems([]);
      setAllTopUpItems([]);
      setCurrentTopUpIndex(0);
      inventoryCache.clear(`tech_inventory_${technicianId}`);
      inventoryCache.clear('main_inventory');
      try {
        await loadMainInventory();
        const [jobsResult, partsResult] = await Promise.all([
          db.jobs.getByTechnicianId(technicianId),
          db.jobPartsUsed.getByTechnician(technicianId),
        ]);
        const jobs = jobsResult.data || [];
        const allPartsUsed = (partsResult.data || []) as any[];
        if (jobsResult.error) throw jobsResult.error;
        if (partsResult.error) throw partsResult.error;

        const completedJobs = (jobs as any[]).filter((j: any) => j.status === 'COMPLETED');
        let lastWorkingDayKey: string | null = null;
        completedJobs.forEach((job: any) => {
          const dateStr = job.completed_at || job.end_time;
          if (!dateStr) return;
          const key = toDateKey(new Date(dateStr));
          if (lastWorkingDayKey == null || key > lastWorkingDayKey) lastWorkingDayKey = key;
        });
        if (!lastWorkingDayKey) {
          toast.info('No completed jobs found.');
          onOpenChange(false);
          return;
        }

        const getJob = (p: any) => unwrap(p.job);
        const getPartJobDayKey = (part: any): string | null => {
          const job = getJob(part);
          if (!job || (!job.completed_at && !job.end_time)) return null;
          return toDateKey(new Date(job.completed_at || job.end_time));
        };
        const getPartDate = (part: any): string => {
          const job = getJob(part);
          if (job && (job.completed_at || job.end_time)) return job.completed_at || job.end_time;
          return part.created_at || '';
        };

        const partHiddenFromTopup = (part: any): boolean => {
          const job = getJob(part);
          const raw = job?.requirements;
          let reqs: any[] = [];
          if (typeof raw === 'string') {
            try {
              reqs = JSON.parse(raw);
            } catch {
              reqs = [];
            }
          } else if (Array.isArray(raw)) {
            reqs = raw;
          } else if (raw && typeof raw === 'object') {
            reqs = [raw];
          }
          if (!Array.isArray(reqs)) return false;
          if (reqs.some((r: any) => r?.hide_parts_from_topup === true)) return true;
          const hiddenEntry = reqs.find((r: any) => Array.isArray(r?.topup_hidden_inventory_ids));
          if (hiddenEntry) {
            const ids = hiddenEntry.topup_hidden_inventory_ids.map((id: any) => String(id));
            return ids.includes(String(part.inventory_id));
          }
          return false;
        };

        const partsOnLastDay = allPartsUsed.filter(
          (part: any) => getPartJobDayKey(part) === lastWorkingDayKey
        );
        const stockedParts = partsOnLastDay.filter(
          (part: any) => part.inventory_id && !partHiddenFromTopup(part)
        );

        // Per-job queues
        const jobsMap = new Map<string, TopUpJobGroup>();
        stockedParts.forEach((part: any) => {
          const job = getJob(part);
          const jobId = String(part.job_id || '');
          if (!jobId) return;
          const customer = unwrap(job?.customer) as { full_name?: string } | null;
          if (!jobsMap.has(jobId)) {
            jobsMap.set(jobId, {
              job_id: jobId,
              job_number: job?.job_number ?? null,
              customer_name: customer?.full_name ?? null,
              completed_at: job?.completed_at || job?.end_time || part.created_at || '',
              topUpItems: [],
            });
          }
          const group = jobsMap.get(jobId)!;
          const invId = String(part.inventory_id);
          const existing = group.topUpItems.find((p) => p.inventory_id === invId);
          const qty = Number(part.quantity_used) || 0;
          const lastUsed = getPartDate(part) || part.created_at || '';
          const inventory = unwrap(part.inventory) as
            | { id: string; product_name: string; code: string | null }
            | null;
          if (existing) {
            existing.quantity_used += qty;
            if (lastUsed && new Date(lastUsed) > new Date(existing.last_used_at)) {
              existing.last_used_at = lastUsed;
            }
          } else {
            group.topUpItems.push({
              inventory_id: invId,
              quantity_used: qty,
              last_used_at: lastUsed,
              inventory: inventory ?? undefined,
            });
          }
        });

        const jobGroupsArray = Array.from(jobsMap.values())
          .map((g) => ({
            ...g,
            topUpItems: [...g.topUpItems].sort(
              (a, b) => new Date(b.last_used_at).getTime() - new Date(a.last_used_at).getTime()
            ),
          }))
          .filter((g) => g.topUpItems.length > 0)
          .sort(
            (a, b) => new Date(b.completed_at).getTime() - new Date(a.completed_at).getTime()
          );

        // Aggregated all-items queue (same product across jobs summed)
        const byJobAndInv = new Map<string, { quantity_used: number; last_used_at: string; part: any }>();
        stockedParts.forEach((part: any) => {
          const key = `${part.job_id}_${part.inventory_id}`;
          if (byJobAndInv.has(key)) {
            const existing = byJobAndInv.get(key)!;
            const partDate = getPartDate(part);
            if (partDate && new Date(partDate) > new Date(existing.last_used_at)) {
              existing.last_used_at = partDate;
            }
            return;
          }
          byJobAndInv.set(key, {
            quantity_used: Number(part.quantity_used) || 0,
            last_used_at: getPartDate(part) || part.created_at || '',
            part,
          });
        });

        const groupedItems = new Map<string, TopUpItem>();
        byJobAndInv.forEach(({ quantity_used, last_used_at, part }) => {
          const key = String(part.inventory_id);
          if (groupedItems.has(key)) {
            const existing = groupedItems.get(key)!;
            existing.quantity_used += quantity_used;
            if (new Date(last_used_at) > new Date(existing.last_used_at)) {
              existing.last_used_at = last_used_at;
            }
          } else {
            groupedItems.set(key, {
              inventory_id: key,
              quantity_used,
              last_used_at,
              inventory: (unwrap(part.inventory) as TopUpItem['inventory']) ?? undefined,
            });
          }
        });

        const itemsArray = Array.from(groupedItems.values()).sort(
          (a, b) => new Date(b.last_used_at).getTime() - new Date(a.last_used_at).getTime()
        );

        if (cancelled) return;
        if (itemsArray.length === 0 && jobGroupsArray.length === 0) {
          const lastDayLabel = lastWorkingDayKey
            ? new Date(lastWorkingDayKey + 'T12:00:00').toLocaleDateString('en-IN', {
                day: 'numeric',
                month: 'short',
                year: 'numeric',
              })
            : 'that day';
          toast.info(`No parts were used on last working day (${lastDayLabel}).`);
          onOpenChange(false);
          return;
        }

        const lastDayLabel = new Date(lastWorkingDayKey + 'T12:00:00').toLocaleDateString('en-IN', {
          day: 'numeric',
          month: 'short',
          year: 'numeric',
        });
        setTopUpLastWorkingDayLabel(lastDayLabel);
        setJobGroups(jobGroupsArray);
        setAllTopUpItems(itemsArray);
        setCurrentTopUpIndex(0);
        setEditableTopUpQty(itemsArray[0] ? String(itemsArray[0].quantity_used) : '');
        setIsTopUpQtyEditing(false);
        setViewMode(itemsArray.length > 0 ? 'all' : 'jobs');
      } catch (err: any) {
        if (!cancelled) {
          console.error('Error loading top up items:', err);
          toast.error(err?.message || 'Failed to load used items');
          onOpenChange(false);
        }
      } finally {
        if (!cancelled) setTopUpLoading(false);
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [open, technicianId, onOpenChange]);

  useEffect(() => {
    if (
      (viewMode === 'all' || viewMode === 'job-topup') &&
      activeQueue.length > 0 &&
      currentTopUpIndex < activeQueue.length
    ) {
      const item = activeQueue[currentTopUpIndex];
      if (item) setEditableTopUpQty(String(item.quantity_used));
      setIsTopUpQtyEditing(false);
    }
  }, [viewMode, currentTopUpIndex, activeQueue]);

  useEffect(() => {
    if (isTopUpQtyEditing) {
      const t = setTimeout(() => topUpQtyInputRef.current?.focus(), 50);
      return () => clearTimeout(t);
    }
  }, [isTopUpQtyEditing]);

  const startJobTopUp = (job: TopUpJobGroup) => {
    setSelectedJobId(job.job_id);
    setJobTopUpItems(job.topUpItems.map((item) => ({ ...item })));
    setCurrentTopUpIndex(0);
    setEditableTopUpQty(String(job.topUpItems[0]?.quantity_used ?? 0));
    setIsTopUpQtyEditing(false);
    setViewMode('job-topup');
  };

  const backToJobs = () => {
    if (selectedJobId) {
      setJobGroups((prev) =>
        prev
          .map((job) =>
            job.job_id === selectedJobId ? { ...job, topUpItems: jobTopUpItems } : job
          )
          .filter((job) => job.topUpItems.length > 0)
      );
    }
    setViewMode('jobs');
    setSelectedJobId(null);
    setJobTopUpItems([]);
    setCurrentTopUpIndex(0);
    setEditableTopUpQty('');
    setIsTopUpQtyEditing(false);
  };

  const switchTab = (tab: 'all' | 'jobs') => {
    if (viewMode === 'job-topup' && selectedJobId) {
      setJobGroups((prev) =>
        prev
          .map((job) =>
            job.job_id === selectedJobId ? { ...job, topUpItems: jobTopUpItems } : job
          )
          .filter((job) => job.topUpItems.length > 0)
      );
      setSelectedJobId(null);
      setJobTopUpItems([]);
    }
    setViewMode(tab);
    setCurrentTopUpIndex(0);
    if (tab === 'all' && allTopUpItems.length > 0) {
      setEditableTopUpQty(String(allTopUpItems[0].quantity_used));
    }
    setIsTopUpQtyEditing(false);
  };

  const handleConfirmTopUp = async () => {
    if (!currentItem) return;
    const qty = Math.max(0, parseInt(editableTopUpQty, 10) || 0);
    const isJobFlow = viewMode === 'job-topup';

    try {
      setTopUpLoading(true);
      if (qty === 0) {
        toast.success('Skipped (0 qty)');
      } else {
        const mainItem = mainInventory.find((i) => i.id === currentItem.inventory_id);
        if (mainItem && mainItem.quantity < qty) {
          toast.error(`Insufficient stock in main inventory. Available: ${mainItem.quantity}, needed: ${qty}.`);
          return;
        }
        const { error: rpcError } = await db.technicianInventory.topUpFromMain(
          currentItem.inventory_id,
          qty,
          technicianId
        );
        if (rpcError) throw rpcError;
        toast.success(`Added ${qty} ${currentItem.inventory?.product_name || 'items'}`);
      }

      inventoryCache.clear(`tech_inventory_${technicianId}`);
      inventoryCache.clear('main_inventory');
      await loadMainInventory();
      onSuccess?.();

      if (isJobFlow && selectedJobId) {
        const nextItems = jobTopUpItems.filter((_, i) => i !== currentTopUpIndex);
        const nextJobs = jobGroups
          .map((job) =>
            job.job_id === selectedJobId ? { ...job, topUpItems: nextItems } : job
          )
          .filter((job) => job.topUpItems.length > 0);

        const nextAll = allTopUpItems
          .map((item) => {
            if (item.inventory_id !== currentItem.inventory_id) return item;
            const left = item.quantity_used - currentItem.quantity_used;
            return left > 0 ? { ...item, quantity_used: left } : null;
          })
          .filter((item): item is TopUpItem => item != null);
        setAllTopUpItems(nextAll);

        if (nextItems.length === 0) {
          toast.success('Job done');
          setJobGroups(nextJobs);
          setJobTopUpItems([]);
          setSelectedJobId(null);
          setCurrentTopUpIndex(0);
          if (nextJobs.length === 0 && nextAll.length === 0) {
            toast.success('Done!');
            onOpenChange(false);
          } else {
            setViewMode('jobs');
          }
        } else {
          setJobGroups(nextJobs);
          setJobTopUpItems(nextItems);
          const nextIndex = Math.min(currentTopUpIndex, nextItems.length - 1);
          setCurrentTopUpIndex(nextIndex);
          setEditableTopUpQty(String(nextItems[nextIndex].quantity_used));
          setIsTopUpQtyEditing(false);
        }
      } else {
        const nextItems = allTopUpItems.filter((_, i) => i !== currentTopUpIndex);
        setJobGroups((prev) =>
          prev
            .map((job) => ({
              ...job,
              topUpItems: job.topUpItems.filter((p) => p.inventory_id !== currentItem.inventory_id),
            }))
            .filter((job) => job.topUpItems.length > 0)
        );
        setAllTopUpItems(nextItems);
        if (nextItems.length === 0) {
          toast.success('Done!');
          onOpenChange(false);
          setCurrentTopUpIndex(0);
        } else {
          const nextIndex = Math.min(currentTopUpIndex, nextItems.length - 1);
          setCurrentTopUpIndex(nextIndex);
          setEditableTopUpQty(String(nextItems[nextIndex].quantity_used));
          setIsTopUpQtyEditing(false);
        }
      }
    } catch (err: any) {
      console.error('Error topping up item:', err);
      toast.error(err?.message || 'Failed to top up item');
    } finally {
      setTopUpLoading(false);
    }
  };

  const handleSkipTopUp = () => {
    if (!currentItem) return;
    const isJobFlow = viewMode === 'job-topup';

    if (isJobFlow && selectedJobId) {
      const nextItems = jobTopUpItems.filter((_, i) => i !== currentTopUpIndex);
      const nextJobs = jobGroups
        .map((job) =>
          job.job_id === selectedJobId ? { ...job, topUpItems: nextItems } : job
        )
        .filter((job) => job.topUpItems.length > 0);

      if (nextItems.length === 0) {
        setJobGroups(nextJobs);
        setJobTopUpItems([]);
        setSelectedJobId(null);
        setCurrentTopUpIndex(0);
        setViewMode('jobs');
      } else {
        setJobGroups(nextJobs);
        setJobTopUpItems(nextItems);
        const nextIndex = Math.min(currentTopUpIndex, nextItems.length - 1);
        setCurrentTopUpIndex(nextIndex);
        setEditableTopUpQty(String(nextItems[nextIndex].quantity_used));
        setIsTopUpQtyEditing(false);
      }
    } else {
      const nextItems = allTopUpItems.filter((_, i) => i !== currentTopUpIndex);
      setJobGroups((prev) =>
        prev
          .map((job) => ({
            ...job,
            topUpItems: job.topUpItems.filter((p) => p.inventory_id !== currentItem.inventory_id),
          }))
          .filter((job) => job.topUpItems.length > 0)
      );
      setAllTopUpItems(nextItems);
      if (nextItems.length === 0) {
        onOpenChange(false);
        setCurrentTopUpIndex(0);
      } else {
        const nextIndex = Math.min(currentTopUpIndex, nextItems.length - 1);
        setCurrentTopUpIndex(nextIndex);
        setEditableTopUpQty(String(nextItems[nextIndex].quantity_used));
        setIsTopUpQtyEditing(false);
      }
    }
  };

  const handleClose = () => {
    setAllTopUpItems([]);
    setJobGroups([]);
    setSelectedJobId(null);
    setJobTopUpItems([]);
    setCurrentTopUpIndex(0);
    setEditableTopUpQty('');
    setIsTopUpQtyEditing(false);
    setTopUpLastWorkingDayLabel('');
    setViewMode('all');
    onOpenChange(false);
  };

  const formatJobTime = (iso: string) => {
    if (!iso) return '';
    try {
      return new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
    } catch {
      return '';
    }
  };

  const jobTitle =
    selectedJob?.customer_name?.trim() ||
    (selectedJob?.job_number ? `Job ${selectedJob.job_number}` : 'Job');

  const tabValue = viewMode === 'job-topup' ? 'jobs' : viewMode;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) handleClose();
      }}
    >
      <DialogContent
        className="w-[calc(100vw-1.25rem)] max-w-[500px] max-h-[90dvh] overflow-y-auto p-4 sm:p-6"
        hideCloseButton
      >
        <DialogHeader className="space-y-3 pr-0">
          {viewMode === 'job-topup' ? (
            <div className="flex items-start gap-2 min-w-0">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-9 w-9 shrink-0 -ml-1"
                onClick={backToJobs}
                disabled={topUpLoading}
                aria-label="Back to jobs"
              >
                <ChevronLeft className="h-5 w-5" />
              </Button>
              <div className="min-w-0 flex-1">
                <DialogTitle className="text-base sm:text-lg leading-snug break-words">
                  {jobTitle}
                </DialogTitle>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {topUpLastWorkingDayLabel}
                  {selectedJob?.job_number ? ` · Job ${selectedJob.job_number}` : ''}
                </p>
              </div>
            </div>
          ) : (
            <>
              <DialogTitle className="text-base sm:text-lg leading-snug break-words">
                Top Up — {topUpLastWorkingDayLabel || '—'}
              </DialogTitle>
              <Tabs
                value={tabValue}
                onValueChange={(v) => switchTab(v as 'all' | 'jobs')}
                className="w-full"
              >
                <TabsList className="grid w-full grid-cols-2 h-10">
                  <TabsTrigger value="all" className="text-sm" disabled={allTopUpItems.length === 0 && !topUpLoading}>
                    Top up
                  </TabsTrigger>
                  <TabsTrigger value="jobs" className="text-sm" disabled={jobGroups.length === 0 && !topUpLoading}>
                    By job
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            </>
          )}
        </DialogHeader>

        {topUpLoading && allTopUpItems.length === 0 && jobGroups.length === 0 ? (
          <div className="py-8 text-center text-muted-foreground text-sm">Loading...</div>
        ) : viewMode === 'jobs' ? (
          <div className="space-y-3 py-2 min-w-0">
            <p className="text-sm text-muted-foreground">
              Pick a job, then Add or Skip each part used.
            </p>
            {jobGroups.map((job) => {
              const name =
                job.customer_name?.trim() ||
                (job.job_number ? `Job ${job.job_number}` : 'Job');
              const itemCount = job.topUpItems.length;
              return (
                <button
                  key={job.job_id}
                  type="button"
                  onClick={() => startJobTopUp(job)}
                  className="w-full text-left rounded-lg border border-gray-200 bg-gray-50/80 p-3 sm:p-4 min-w-0 hover:bg-gray-100 active:bg-gray-100 transition-colors"
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
                    <p className="text-sm font-semibold text-gray-900 break-words">{name}</p>
                    {job.completed_at ? (
                      <p className="text-xs text-muted-foreground shrink-0">
                        {formatJobTime(job.completed_at)}
                      </p>
                    ) : null}
                  </div>
                  {job.customer_name && job.job_number ? (
                    <p className="text-xs text-muted-foreground mt-0.5 break-all">
                      Job {job.job_number}
                    </p>
                  ) : null}
                  <p className="text-xs text-blue-600 font-medium mt-2">
                    {itemCount} item{itemCount === 1 ? '' : 's'} · Tap to top up
                  </p>
                </button>
              );
            })}
          </div>
        ) : currentItem ? (
          <div className="space-y-4 py-2 sm:py-4 min-w-0">
            <div className="border rounded-lg p-3 sm:p-4 bg-gray-50">
              <div className="space-y-2">
                <div className="min-w-0">
                  <Label className="text-sm font-medium text-gray-600">Product</Label>
                  <p className="text-base font-semibold mt-1 break-words">
                    {currentItem.inventory?.product_name || 'Unknown Product'}
                  </p>
                  {currentItem.inventory?.code && (
                    <p className="text-sm text-gray-500 break-all">Code: {currentItem.inventory.code}</p>
                  )}
                </div>
                <div>
                  <Label className="text-sm font-medium text-gray-600">Quantity used</Label>
                  <p className="text-lg font-bold text-blue-600 mt-1">{currentItem.quantity_used}</p>
                </div>
                <div>
                  <Label className="text-sm font-medium text-gray-600">Quantity to add</Label>
                  <div className="flex items-center gap-2 mt-1">
                    {isTopUpQtyEditing ? (
                      <Input
                        ref={topUpQtyInputRef}
                        type="number"
                        inputMode="numeric"
                        min={0}
                        value={editableTopUpQty}
                        onChange={(e) => setEditableTopUpQty(e.target.value)}
                        onBlur={() => setIsTopUpQtyEditing(false)}
                        className="max-w-[100px] text-lg font-semibold"
                      />
                    ) : (
                      <>
                        <span className="text-lg font-semibold min-w-[2ch]">
                          {editableTopUpQty || currentItem.quantity_used}
                        </span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 shrink-0"
                          onClick={() => {
                            setEditableTopUpQty(String(currentItem.quantity_used));
                            setIsTopUpQtyEditing(true);
                          }}
                          aria-label="Edit quantity"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground text-center py-6">
            Nothing left to top up
            {jobGroups.length > 0 ? '. Try By job.' : '.'}
          </p>
        )}

        <DialogFooter className="flex flex-col gap-2 w-full items-stretch sm:space-x-0">
          {(viewMode === 'all' || viewMode === 'job-topup') && currentItem ? (
            <div className="flex gap-2 w-full">
              <Button
                type="button"
                variant="outline"
                onClick={handleSkipTopUp}
                disabled={topUpLoading}
                className="flex-1"
              >
                Skip
              </Button>
              <Button
                onClick={handleConfirmTopUp}
                disabled={topUpLoading || activeQueue.length === 0}
                className="flex-1 bg-blue-600 hover:bg-blue-700"
              >
                {topUpLoading ? 'Adding...' : 'Add to Inventory'}
              </Button>
            </div>
          ) : null}
          <div className="flex flex-col gap-1.5 w-full items-center">
            {(viewMode === 'all' || viewMode === 'job-topup') && activeQueue.length > 0 ? (
              <p className="text-xs text-muted-foreground">
                {currentTopUpIndex + 1} of {activeQueue.length}
              </p>
            ) : viewMode === 'jobs' && jobGroups.length > 0 ? (
              <p className="text-xs text-muted-foreground">
                {jobGroups.length} job{jobGroups.length === 1 ? '' : 's'}
              </p>
            ) : null}
            <Button
              type="button"
              variant="ghost"
              onClick={handleClose}
              disabled={topUpLoading}
              className="w-full"
            >
              Close
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default TechnicianTopUpDialog;
