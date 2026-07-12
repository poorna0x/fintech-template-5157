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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { GripVertical, ListOrdered, Loader2, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
  fetchTechnicianJobsForVisitOrder,
  filterCachedJobsForVisitOrder,
  saveTechnicianVisitOrder,
  visitOrderStopLabel,
  type VisitOrderJobRow,
} from '@/lib/adminVisitOrder';
import type { Job, Technician } from '@/types';

type ArrangeTechnicianVisitOrderDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  technicians: Technician[];
  /** Ongoing jobs already on the dashboard — used as a fast first paint, then refreshed. */
  initialJobs?: Array<Job | Record<string, unknown>>;
  /** Pre-select when opened from a job row. */
  initialTechnicianId?: string | null;
  /** Optional: patch local admin jobs cache after save. */
  onSaved?: (technicianId: string, orderedJobIds: string[]) => void;
};

type DropHint = { index: number; position: 'before' | 'after' } | null;

const AUTO_SCROLL_EDGE_PX = 80;
const AUTO_SCROLL_MAX_SPEED = 20;

function reorderRows(list: VisitOrderJobRow[], from: number, to: number): VisitOrderJobRow[] {
  if (from === to || from < 0 || to < 0 || from >= list.length) return list;
  const next = [...list];
  const [item] = next.splice(from, 1);
  const clampedTo = Math.max(0, Math.min(to, next.length));
  next.splice(clampedTo, 0, item);
  return next;
}

function resolveInsertIndex(from: number, overIndex: number, position: 'before' | 'after'): number {
  let insertAt = position === 'before' ? overIndex : overIndex + 1;
  if (from < insertAt) insertAt -= 1;
  return insertAt;
}

function findScrollableAncestor(node: HTMLElement | null): HTMLElement {
  let parent = node?.parentElement ?? null;
  while (parent) {
    const { overflowY } = window.getComputedStyle(parent);
    if (
      (overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay') &&
      parent.scrollHeight > parent.clientHeight + 1
    ) {
      return parent;
    }
    parent = parent.parentElement;
  }
  return document.documentElement;
}

function autoScrollContainer(scrollEl: HTMLElement, clientY: number): void {
  const rect = scrollEl.getBoundingClientRect();
  const distFromBottom = rect.bottom - clientY;
  const distFromTop = clientY - rect.top;

  if (distFromBottom < AUTO_SCROLL_EDGE_PX) {
    const intensity = Math.min(
      1,
      (AUTO_SCROLL_EDGE_PX - Math.max(distFromBottom, 0)) / AUTO_SCROLL_EDGE_PX + 0.15
    );
    scrollEl.scrollTop += AUTO_SCROLL_MAX_SPEED * intensity;
  } else if (distFromTop < AUTO_SCROLL_EDGE_PX) {
    const intensity = Math.min(
      1,
      (AUTO_SCROLL_EDGE_PX - Math.max(distFromTop, 0)) / AUTO_SCROLL_EDGE_PX + 0.15
    );
    scrollEl.scrollTop -= AUTO_SCROLL_MAX_SPEED * intensity;
  }
}

export default function ArrangeTechnicianVisitOrderDialog({
  open,
  onOpenChange,
  technicians,
  initialJobs = [],
  initialTechnicianId = null,
  onSaved,
}: ArrangeTechnicianVisitOrderDialogProps) {
  const activeTechs = useMemo(
    () =>
      technicians
        .filter((t) => {
          const status = String((t as any).status || '').toUpperCase();
          return !status || status === 'ACTIVE' || status === 'ON_DUTY' || status === 'AVAILABLE';
        })
        .slice()
        .sort((a, b) =>
          String(a.fullName || (a as any).full_name || '').localeCompare(
            String(b.fullName || (b as any).full_name || '')
          )
        ),
    [technicians]
  );

  const [technicianId, setTechnicianId] = useState('');
  const [rows, setRows] = useState<VisitOrderJobRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dropHint, setDropHint] = useState<DropHint>(null);

  const listRef = useRef<HTMLOListElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const pointerYRef = useRef(0);
  const scrollRafRef = useRef<number | null>(null);
  const draggingRef = useRef(false);
  const dragIndexRef = useRef<number | null>(null);

  const applyRows = useCallback((data: VisitOrderJobRow[]) => {
    setRows(data);
    setDirty(data.some((j) => j.visit_order == null));
  }, []);

  const loadJobs = useCallback(
    async (techId: string, opts?: { silentCacheFirst?: boolean }) => {
      if (!techId) {
        setRows([]);
        return;
      }

      if (opts?.silentCacheFirst && initialJobs.length) {
        const cached = filterCachedJobsForVisitOrder(initialJobs, techId);
        if (cached.length > 0) applyRows(cached);
      }

      setLoading(true);
      try {
        const { data, error } = await fetchTechnicianJobsForVisitOrder(techId);
        if (error) {
          toast.error(error.message || 'Failed to load jobs');
          return;
        }
        applyRows(data);
      } finally {
        setLoading(false);
      }
    },
    [initialJobs, applyRows]
  );

  useEffect(() => {
    if (!open) return;
    const nextTech =
      initialTechnicianId && activeTechs.some((t) => t.id === initialTechnicianId)
        ? initialTechnicianId
        : activeTechs[0]?.id || '';
    setTechnicianId(nextTech);
    setDirty(false);
    setDragIndex(null);
    setDropHint(null);
    dragIndexRef.current = null;
    draggingRef.current = false;
    void loadJobs(nextTech, { silentCacheFirst: true });
  }, [open, initialTechnicianId, activeTechs, loadJobs]);

  const clearDragState = useCallback(() => {
    draggingRef.current = false;
    dragIndexRef.current = null;
    if (scrollRafRef.current !== null) {
      cancelAnimationFrame(scrollRafRef.current);
      scrollRafRef.current = null;
    }
    setDragIndex(null);
    setDropHint(null);
  }, []);

  const tickAutoScroll = useCallback(() => {
    if (!draggingRef.current) return;
    const scrollEl =
      scrollContainerRef.current ?? findScrollableAncestor(listRef.current);
    autoScrollContainer(scrollEl, pointerYRef.current);
    scrollRafRef.current = requestAnimationFrame(tickAutoScroll);
  }, []);

  const trackPointer = useCallback((clientY: number) => {
    pointerYRef.current = clientY;
  }, []);

  useEffect(() => {
    if (dragIndex === null) return;

    const onDragOver = (event: DragEvent) => {
      trackPointer(event.clientY);
      event.preventDefault();
    };

    document.addEventListener('dragover', onDragOver, { passive: false });
    return () => document.removeEventListener('dragover', onDragOver);
  }, [dragIndex, trackPointer]);

  useEffect(() => {
    return () => {
      if (scrollRafRef.current !== null) {
        cancelAnimationFrame(scrollRafRef.current);
      }
    };
  }, []);

  const moveRow = useCallback((index: number, direction: -1 | 1) => {
    const next = index + direction;
    setRows((prev) => {
      if (next < 0 || next >= prev.length) return prev;
      return reorderRows(prev, index, next);
    });
    setDirty(true);
  }, []);

  const handleDragStart = useCallback(
    (index: number, event: React.DragEvent) => {
      if (saving) {
        event.preventDefault();
        return;
      }
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', String(index));
      if (event.currentTarget instanceof HTMLElement) {
        const row = event.currentTarget.closest('[data-visit-order-row]') as HTMLElement | null;
        if (row) event.dataTransfer.setDragImage(row, 24, 24);
        else event.dataTransfer.setDragImage(event.currentTarget, 16, 16);
      }
      trackPointer(event.clientY);
      draggingRef.current = true;
      dragIndexRef.current = index;
      setDragIndex(index);
      setDropHint(null);
      if (scrollRafRef.current !== null) {
        cancelAnimationFrame(scrollRafRef.current);
      }
      scrollRafRef.current = requestAnimationFrame(tickAutoScroll);
    },
    [saving, tickAutoScroll, trackPointer]
  );

  const handleDragOverRow = useCallback(
    (index: number, event: React.DragEvent<HTMLLIElement>) => {
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
      trackPointer(event.clientY);
      const from = dragIndexRef.current;
      if (from == null || from === index) {
        setDropHint(null);
        return;
      }

      const rect = event.currentTarget.getBoundingClientRect();
      const position: 'before' | 'after' =
        event.clientY < rect.top + rect.height / 2 ? 'before' : 'after';

      setDropHint((prev) =>
        prev?.index === index && prev.position === position ? prev : { index, position }
      );
    },
    [trackPointer]
  );

  const handleDropRow = useCallback(
    (overIndex: number, event: React.DragEvent) => {
      event.preventDefault();
      const from = dragIndexRef.current;
      if (from == null) {
        clearDragState();
        return;
      }

      const rect = event.currentTarget.getBoundingClientRect();
      const position: 'before' | 'after' =
        event.clientY < rect.top + rect.height / 2 ? 'before' : 'after';
      const insertAt = resolveInsertIndex(from, overIndex, position);

      if (insertAt !== from) {
        setRows((prev) => reorderRows(prev, from, insertAt));
        setDirty(true);
      }
      clearDragState();
    },
    [clearDragState]
  );

  const handleSave = async () => {
    if (!technicianId || rows.length === 0) return;
    setSaving(true);
    try {
      const orderedIds = rows.map((r) => r.id);
      const { error } = await saveTechnicianVisitOrder(technicianId, orderedIds);
      if (error) {
        toast.error(error.message || 'Failed to save order');
        return;
      }
      setDirty(false);
      onSaved?.(technicianId, orderedIds);
      toast.success('Visit order saved — technician list updated');
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  const techLabel = (t: Technician) =>
    String(t.fullName || (t as any).full_name || 'Technician').trim() || 'Technician';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          '!flex flex-col gap-0 overflow-hidden p-0',
          '!w-[calc(100vw-1rem)] !max-w-[calc(100vw-1rem)]',
          'sm:!w-full sm:!max-w-lg',
          'max-h-[min(92dvh,92vh)] sm:max-h-[90vh]',
          '!top-[max(0.5rem,env(safe-area-inset-top,0px))] !translate-y-0',
          'sm:!top-[50%] sm:!translate-y-[-50%]',
          'rounded-xl sm:rounded-lg',
          '[&>button]:z-10 [&>button]:!right-3 [&>button]:!top-3',
          '[&>button]:h-10 [&>button]:w-10 sm:[&>button]:h-8 sm:[&>button]:w-8'
        )}
      >
        <DialogHeader className="shrink-0 space-y-1.5 border-b px-4 pb-3 pt-4 pr-14 sm:px-6 sm:pt-5 sm:pr-14 text-left">
          <DialogTitle className="flex items-center gap-2 text-base sm:text-lg">
            <ListOrdered className="h-5 w-5 shrink-0" />
            Arrange visit order
          </DialogTitle>
          <DialogDescription className="text-xs sm:text-sm leading-relaxed">
            Drag the handle to set #1, #2, #3… The list scrolls automatically near the edges.
          </DialogDescription>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden px-4 py-3 sm:px-6 sm:py-4">
          <div className="shrink-0 space-y-1.5">
            <Label htmlFor="visit-order-tech">Technician</Label>
            <Select
              value={technicianId || undefined}
              onValueChange={(v) => {
                setTechnicianId(v);
                void loadJobs(v, { silentCacheFirst: true });
              }}
            >
              <SelectTrigger id="visit-order-tech" className="h-11 sm:h-10">
                <SelectValue placeholder="Select technician" />
              </SelectTrigger>
              <SelectContent>
                {activeTechs.map((t) => (
                  <SelectItem key={t.id} value={t.id} className="min-h-11 sm:min-h-0">
                    {techLabel(t)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex shrink-0 items-center justify-between gap-2">
            <p className="min-w-0 flex-1 text-xs sm:text-sm text-muted-foreground">
              {loading
                ? 'Loading…'
                : `${rows.length} open job${rows.length === 1 ? '' : 's'}`}
              {!loading && rows.length > 1 ? ' · drag to reorder' : ''}
              {dirty ? ' · unsaved' : ''}
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-10 shrink-0 px-3 sm:h-9"
              disabled={!technicianId || loading || saving}
              onClick={() => void loadJobs(technicianId)}
            >
              <RefreshCw className={`h-4 w-4 sm:mr-1.5 ${loading ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Refresh</span>
            </Button>
          </div>

          <div
            ref={scrollContainerRef}
            className="min-h-0 flex-1 overflow-y-auto overscroll-contain -mx-1 px-1 pb-[max(0.25rem,env(safe-area-inset-bottom,0px))]"
            onDragOver={(event) => {
              if (dragIndex === null) return;
              event.preventDefault();
              trackPointer(event.clientY);
            }}
          >
            {loading && rows.length === 0 ? (
              <div className="flex items-center justify-center py-10 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin mr-2" />
                Loading jobs…
              </div>
            ) : rows.length === 0 ? (
              <div className="rounded-md border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
                No open jobs for this technician.
              </div>
            ) : (
              <ol
                ref={listRef}
                className="space-y-2"
                onDragLeave={(event) => {
                  if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                    setDropHint(null);
                  }
                }}
              >
                {rows.map((job, index) => {
                  const status = String(job.status || '').toUpperCase();
                  const isDragging = dragIndex === index;
                  const showBefore =
                    dropHint?.index === index &&
                    dropHint.position === 'before' &&
                    dragIndex !== index;
                  const showAfter =
                    dropHint?.index === index &&
                    dropHint.position === 'after' &&
                    dragIndex !== index;
                  return (
                    <li
                      key={job.id}
                      data-visit-order-row
                      onDragOver={(e) => handleDragOverRow(index, e)}
                      onDrop={(e) => handleDropRow(index, e)}
                      className={cn(
                        'relative flex items-center gap-2 rounded-lg border bg-white p-2.5 sm:p-2 transition-[opacity,box-shadow,border-color] duration-150 select-none',
                        isDragging && 'opacity-40 border-dashed border-sky-300 bg-sky-50/40',
                        !isDragging && 'border-gray-200'
                      )}
                    >
                      {showBefore ? (
                        <div
                          className="pointer-events-none absolute left-2 right-2 top-0 z-10 h-0.5 -translate-y-1/2 rounded-full bg-sky-500 shadow-[0_0_0_2px_rgba(14,165,233,0.25)]"
                          aria-hidden
                        />
                      ) : null}
                      {showAfter ? (
                        <div
                          className="pointer-events-none absolute bottom-0 left-2 right-2 z-10 h-0.5 translate-y-1/2 rounded-full bg-sky-500 shadow-[0_0_0_2px_rgba(14,165,233,0.25)]"
                          aria-hidden
                        />
                      ) : null}

                      <div
                        draggable={!saving}
                        onDragStart={(e) => handleDragStart(index, e)}
                        onDragEnd={clearDragState}
                        className={cn(
                          'flex h-11 w-11 sm:h-9 sm:w-9 shrink-0 touch-none items-center justify-center rounded-md text-muted-foreground',
                          !saving &&
                            'cursor-grab hover:bg-slate-100 hover:text-slate-700 active:cursor-grabbing',
                          saving && 'opacity-50'
                        )}
                        aria-label="Drag to reorder"
                        role="button"
                        tabIndex={0}
                        onKeyDown={(event) => {
                          if (event.key === 'ArrowUp') {
                            event.preventDefault();
                            moveRow(index, -1);
                          } else if (event.key === 'ArrowDown') {
                            event.preventDefault();
                            moveRow(index, 1);
                          }
                        }}
                      >
                        <GripVertical className="h-5 w-5" />
                      </div>

                      <span
                        className={cn(
                          'flex h-9 w-9 sm:h-7 sm:w-7 shrink-0 items-center justify-center rounded-full text-sm font-semibold',
                          index === 0
                            ? 'bg-red-600 text-white ring-2 ring-red-300'
                            : 'bg-sky-100 text-sky-800'
                        )}
                      >
                        {index + 1}
                      </span>

                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium text-gray-900 break-words leading-snug">
                          {visitOrderStopLabel(job)}
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                          <span className="truncate max-w-full">{job.job_number || '—'}</span>
                          {status ? (
                            <Badge
                              variant="outline"
                              className="text-[10px] px-1.5 py-0 h-5 shrink-0"
                            >
                              {status.replace('_', ' ')}
                            </Badge>
                          ) : null}
                          {job.scheduled_time_slot ? (
                            <span className="shrink-0">
                              {String(job.scheduled_time_slot).replace('_', ' ')}
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
          </div>
        </div>

        <DialogFooter
          className={cn(
            'shrink-0 gap-2 border-t bg-background px-4 py-3 sm:px-6',
            'pb-[max(0.75rem,env(safe-area-inset-bottom,0px))]',
            'flex-col-reverse sm:flex-row sm:justify-end'
          )}
        >
          <Button
            type="button"
            variant="outline"
            className="h-11 w-full sm:h-10 sm:w-auto"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button
            type="button"
            className="h-11 w-full bg-sky-700 hover:bg-sky-800 sm:h-10 sm:w-auto"
            onClick={() => void handleSave()}
            disabled={!technicianId || rows.length === 0 || saving || !dirty}
          >
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Saving…
              </>
            ) : (
              'Save order'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
