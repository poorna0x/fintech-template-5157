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
import { ArrowDown, ArrowUp, GripVertical, ListOrdered, Loader2, RefreshCw } from 'lucide-react';
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

function reorderRows(list: VisitOrderJobRow[], from: number, to: number): VisitOrderJobRow[] {
  if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) {
    return list;
  }
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
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
  const [overIndex, setOverIndex] = useState<number | null>(null);
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

      // Optional instant paint from admin cache, then always refresh from DB
      // so we never miss open jobs that aren't on the current admin page.
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
    setOverIndex(null);
    dragIndexRef.current = null;
    void loadJobs(nextTech, { silentCacheFirst: true });
  }, [open, initialTechnicianId, activeTechs, loadJobs]);

  const moveRow = (index: number, direction: -1 | 1) => {
    const next = index + direction;
    if (next < 0 || next >= rows.length) return;
    setRows((prev) => reorderRows(prev, index, next));
    setDirty(true);
  };

  const clearDrag = () => {
    dragIndexRef.current = null;
    setDragIndex(null);
    setOverIndex(null);
  };

  const onDragStart = (index: number, e: React.DragEvent) => {
    if (saving) {
      e.preventDefault();
      return;
    }
    dragIndexRef.current = index;
    setDragIndex(index);
    setOverIndex(index);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(index));
    if (e.currentTarget instanceof HTMLElement) {
      e.dataTransfer.setDragImage(e.currentTarget, 24, 24);
    }
  };

  const onDragOverRow = (index: number, e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragIndexRef.current == null) return;
    if (overIndex !== index) setOverIndex(index);
  };

  const onDropRow = (index: number, e: React.DragEvent) => {
    e.preventDefault();
    const from = dragIndexRef.current;
    clearDrag();
    if (from == null || from === index) return;
    setRows((prev) => reorderRows(prev, from, index));
    setDirty(true);
  };

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
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto w-[calc(100vw-2rem)] sm:w-full">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ListOrdered className="h-5 w-5 shrink-0" />
            Arrange visit order
          </DialogTitle>
          <DialogDescription>
            All open jobs for this technician. Drag to set #1, #2, #3… New assigns append at the
            end automatically.
          </DialogDescription>
        </DialogHeader>

        <div className="mt-2 space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="visit-order-tech">Technician</Label>
            <Select
              value={technicianId || undefined}
              onValueChange={(v) => {
                setTechnicianId(v);
                void loadJobs(v, { silentCacheFirst: true });
              }}
            >
              <SelectTrigger id="visit-order-tech">
                <SelectValue placeholder="Select technician" />
              </SelectTrigger>
              <SelectContent>
                {activeTechs.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {techLabel(t)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center justify-between gap-2">
            <p className="text-sm text-muted-foreground">
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
              disabled={!technicianId || loading || saving}
              onClick={() => void loadJobs(technicianId)}
            >
              <RefreshCw className={`h-4 w-4 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>

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
            <ol className="space-y-2" onDragEnd={clearDrag}>
              {rows.map((job, index) => {
                const status = String(job.status || '').toUpperCase();
                const isDragging = dragIndex === index;
                const isDropTarget = overIndex === index && dragIndex != null && dragIndex !== index;
                return (
                  <li
                    key={job.id}
                    draggable={!saving}
                    onDragStart={(e) => onDragStart(index, e)}
                    onDragOver={(e) => onDragOverRow(index, e)}
                    onDrop={(e) => onDropRow(index, e)}
                    onDragEnd={clearDrag}
                    className={cn(
                      'flex items-center gap-2 rounded-md border bg-white px-2 py-2 transition-shadow select-none',
                      !saving && 'cursor-grab active:cursor-grabbing',
                      isDragging && 'opacity-50 shadow-md ring-2 ring-sky-300',
                      isDropTarget && 'border-sky-500 bg-sky-50'
                    )}
                  >
                    <span
                      className="flex h-8 w-6 shrink-0 items-center justify-center text-muted-foreground"
                      aria-hidden
                    >
                      <GripVertical className="h-4 w-4" />
                    </span>
                    <span
                      className={cn(
                        'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-semibold',
                        index === 0
                          ? 'bg-red-600 text-white ring-2 ring-red-300'
                          : 'bg-sky-100 text-sky-800'
                      )}
                    >
                      {index + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-gray-900">
                        {visitOrderStopLabel(job)}
                      </div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                        <span>{job.job_number || '—'}</span>
                        {status ? (
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-5">
                            {status.replace('_', ' ')}
                          </Badge>
                        ) : null}
                        {job.scheduled_time_slot ? (
                          <span>{String(job.scheduled_time_slot).replace('_', ' ')}</span>
                        ) : null}
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-col gap-0.5">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        disabled={index === 0 || saving}
                        onClick={() => moveRow(index, -1)}
                        aria-label="Move up"
                      >
                        <ArrowUp className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        disabled={index === rows.length - 1 || saving}
                        onClick={() => moveRow(index, 1)}
                        aria-label="Move down"
                      >
                        <ArrowDown className="h-4 w-4" />
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </div>

        <DialogFooter className="mt-4 gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={() => void handleSave()}
            disabled={!technicianId || rows.length === 0 || saving || !dirty}
            className="bg-sky-700 hover:bg-sky-800"
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
