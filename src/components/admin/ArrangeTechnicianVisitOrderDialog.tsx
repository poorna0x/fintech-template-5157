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
import { Switch } from '@/components/ui/switch';
import { GripVertical, ListOrdered, Loader2, Map, MapPinned, Route } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
  fetchTechnicianJobsForVisitOrder,
  filterCachedJobsForVisitOrder,
  formatVisitOrderDrive,
  getVisitOrderVisibleForTechnician,
  saveTechnicianVisitOrder,
  setVisitOrderVisibleForTechnician,
  suggestVisitOrderByNearest,
  visitOrderReachPlan,
  visitOrderStopLabel,
  type VisitOrderJobRow,
  type VisitOrderLatLng,
  type VisitOrderReachStop,
} from '@/lib/adminVisitOrder';
import {
  notifyTechnicianJobPush,
  visitOrderChangedPushText,
} from '@/lib/adminTechPushNotify';
import { resolveJobLatLngFromRow, formatAddressForMapsSearch } from '@/lib/jobLocationHelpers';
import { geocodeFromPlaceHints } from '@/lib/googleMapsLink';
import { openGoogleMapsMultiStopDirections, readLocationLatLng } from '@/lib/maps';
import { db } from '@/lib/supabase';
import type { Job, Technician } from '@/types';
import { isActiveTechnicianAccount } from '@/lib/technicianAccountStatus';
import { resolveSupabaseAccessTokenForApi } from '@/lib/ensureSupabaseSession';
import {
  buildJobsMapTechs,
  fetchJobsMapLastLocations,
  fetchJobsMapLiveRows,
} from '@/lib/adminJobsMap';
import { fetchDrivingRoute } from '@/lib/googleMapsDistance';
import VisitOrderPlanMap, { type VisitOrderMapLeg, type VisitOrderMapStop } from './VisitOrderPlanMap';

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
  // Show full active roster (same as Message / Live location). Do not filter on
  // live duty status — BUSY / OFFLINE techs still need visit order.
  const activeTechs = useMemo(
    () =>
      technicians
        .filter((t) => {
          if ((t as any).isActive === false) return false;
          return isActiveTechnicianAccount(t);
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
  const [openingMaps, setOpeningMaps] = useState(false);
  const [showMap, setShowMap] = useState(false);
  const [planning, setPlanning] = useState(false);
  const [techStart, setTechStart] = useState<(VisitOrderLatLng & { name: string }) | null>(null);
  const [pins, setPins] = useState<Record<string, VisitOrderLatLng>>({});
  const [planLegs, setPlanLegs] = useState<VisitOrderMapLeg[]>([]);
  const [reachByJobId, setReachByJobId] = useState<Record<string, VisitOrderReachStop>>({});
  const [dirty, setDirty] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dropHint, setDropHint] = useState<DropHint>(null);
  /** Master switch: technicians only see #1/#2 when this is on. */
  const [showOnTechApp, setShowOnTechApp] = useState(false);
  const [togglingVisibility, setTogglingVisibility] = useState(false);

  const listRef = useRef<HTMLOListElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const pointerYRef = useRef(0);
  const scrollRafRef = useRef<number | null>(null);
  const draggingRef = useRef(false);
  const dragIndexRef = useRef<number | null>(null);
  const pinsRef = useRef(pins);
  const planGenRef = useRef(0);
  pinsRef.current = pins;

  const applyRows = useCallback((data: VisitOrderJobRow[]) => {
    setRows(data);
    setDirty(data.some((j) => j.visit_order == null));
  }, []);

  const techLabel = (t: Technician) =>
    String(t.fullName || (t as any).full_name || 'Technician').trim() || 'Technician';

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
    if (!open) {
      setShowMap(false);
      setPins({});
      setPlanLegs([]);
      setReachByJobId({});
      setTechStart(null);
      setPlanning(false);
      return;
    }
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

  // Load on/off for the selected technician (including when the dropdown changes).
  useEffect(() => {
    if (!open || !technicianId) {
      setShowOnTechApp(false);
      return;
    }
    let cancelled = false;
    void getVisitOrderVisibleForTechnician(technicianId).then((v) => {
      if (!cancelled) setShowOnTechApp(v);
    });
    return () => {
      cancelled = true;
    };
  }, [open, technicianId]);

  useEffect(() => {
    planGenRef.current += 1;
    setPins({});
    setPlanLegs([]);
    setReachByJobId({});
    setTechStart(null);
  }, [technicianId]);

  const handleVisibilityToggle = async (next: boolean) => {
    if (!technicianId) {
      toast.error('Select a technician first');
      return;
    }
    setTogglingVisibility(true);
    const prev = showOnTechApp;
    setShowOnTechApp(next);
    try {
      const { error } = await setVisitOrderVisibleForTechnician(technicianId, next);
      if (error) {
        setShowOnTechApp(prev);
        toast.error(error.message || 'Could not update setting');
        return;
      }
      const name =
        activeTechs.find((t) => t.id === technicianId)?.fullName ||
        (activeTechs.find((t) => t.id === technicianId) as any)?.full_name ||
        'technician';
      toast.success(
        next
          ? `Visit order shown for ${name} (today only — off tomorrow)`
          : `Visit order hidden for ${name}`
      );
    } finally {
      setTogglingVisibility(false);
    }
  };

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

      // Only notify the tech when they can actually see the order numbers.
      if (showOnTechApp) {
        const stopLabels = rows.map((r) => {
          const cust = r.customer as { full_name?: string; fullName?: string } | null | undefined;
          return (
            String(cust?.full_name || cust?.fullName || '').trim() ||
            visitOrderStopLabel(r).split(' · ')[0] ||
            'Customer'
          );
        });
        const orderPush = visitOrderChangedPushText({ stopLabels });
        notifyTechnicianJobPush({
          technicianId,
          ...orderPush,
        });
        void import('@/lib/jobTechnicianWhatsApp').then(({ queueTechnicianJobWhatsAppAutoMessage }) =>
          queueTechnicianJobWhatsAppAutoMessage({
            technicianId,
            category: 'job_assigned',
            title: orderPush.title,
            body: orderPush.body,
          })
        );
      }

      toast.success(
        showOnTechApp
          ? 'Visit order saved — technician list updated'
          : 'Visit order saved (hidden for this technician until you turn it on)'
      );
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  const handleOpenRouteInMaps = async () => {
    if (!technicianId || rows.length === 0 || openingMaps) return;
    setOpeningMaps(true);
    const resolvingToast = toast.loading('Resolving locations…');
    try {
      let techLoc =
        readLocationLatLng(
          activeTechs.find((t) => t.id === technicianId)?.currentLocation ||
            (activeTechs.find((t) => t.id === technicianId) as any)?.current_location
        ) || null;

      try {
        const { data: freshTech } = await db.technicians.getById(technicianId);
        const freshLoc = readLocationLatLng(
          freshTech?.current_location || (freshTech as any)?.currentLocation
        );
        if (freshLoc) techLoc = freshLoc;
      } catch {
        /* use cached tech location */
      }

      if (!techLoc) {
        toast.error(
          'Technician location not available. Ask them to open the app, or use Live location first.',
          { id: resolvingToast }
        );
        return;
      }

      // Google Maps URL: origin + up to 9 waypoints + destination (≤ 11 total points).
      const routeJobs = rows.slice(0, 10);
      if (rows.length > 10) {
        toast.message(`Opening first 10 of ${rows.length} stops (Maps limit).`);
      }

      const accessToken = await resolveSupabaseAccessTokenForApi();
      const jobPoints: { lat: number; lng: number }[] = [];
      const missingLabels: string[] = [];

      for (const job of routeJobs) {
        // Always load full job + customer so short Maps links / location JSON can resolve.
        let row: any =
          initialJobs.find((j) => String((j as any).id) === String(job.id)) || job;
        try {
          const { data: full, error } = await db.jobs.getByIdFull(job.id);
          if (!error && full) row = full;
        } catch {
          /* keep cached/slim row */
        }

        let resolved = await resolveJobLatLngFromRow(row, {
          accessToken,
          // Full row already loaded — skip a second getByIdFull inside the helper.
        });

        // Still missing: expand short link / geocode from address / place name.
        if (!resolved) {
          const cust = row?.customer || {};
          const addressHint =
            formatAddressForMapsSearch(cust.address) ||
            String(cust.visible_address || cust.visibleAddress || '').trim() ||
            '';
          const hints = [addressHint, String(cust.full_name || cust.fullName || '').trim()]
            .filter(Boolean)
            .filter((h, i, arr) => arr.indexOf(h) === i);

          if (hints.length > 0) {
            const geocoded = await geocodeFromPlaceHints(hints, accessToken);
            if (geocoded) {
              resolved = {
                lat: geocoded.geocoded.latitude,
                lng: geocoded.geocoded.longitude,
                workingRow: row,
              };
            }
          }
        }

        if (resolved) {
          jobPoints.push({ lat: resolved.lat, lng: resolved.lng });
        } else {
          missingLabels.push(visitOrderStopLabel(job));
        }
      }

      if (jobPoints.length === 0) {
        toast.error('No job locations found. Add a Google Maps link on the customer and Fetch location.', {
          id: resolvingToast,
        });
        return;
      }

      if (missingLabels.length > 0) {
        toast.warning(
          `Skipped ${missingLabels.length} stop${missingLabels.length === 1 ? '' : 's'} that could not be resolved.`,
          { id: resolvingToast }
        );
      } else {
        toast.dismiss(resolvingToast);
      }

      const stops = [techLoc, ...jobPoints];
      const opened = openGoogleMapsMultiStopDirections(stops);
      if (!opened) {
        toast.error('Could not build the Maps route.');
        return;
      }
      toast.success(
        `Opened route: technician → ${jobPoints.length} job${jobPoints.length === 1 ? '' : 's'}`
      );
    } finally {
      setOpeningMaps(false);
    }
  };

  const resolveTechStart = async (): Promise<(VisitOrderLatLng & { name: string }) | null> => {
    const tech = activeTechs.find((row) => row.id === technicianId);
    const name = tech ? techLabel(tech) : 'Technician';
    const [live, last] = await Promise.all([
      fetchJobsMapLiveRows(),
      fetchJobsMapLastLocations(technicianId ? [technicianId] : []),
    ]);
    const built = buildJobsMapTechs(tech ? [tech] : [], live, last);
    if (built[0]) return { lat: built[0].lat, lng: built[0].lng, name };
    try {
      const { data: freshTech } = await db.technicians.getById(technicianId);
      const loc = readLocationLatLng(freshTech?.current_location || (freshTech as any)?.currentLocation);
      if (loc) return { ...loc, name };
    } catch {
      /* ignore */
    }
    return null;
  };

  const resolveJobPin = async (
    job: VisitOrderJobRow,
    known: Record<string, VisitOrderLatLng>
  ): Promise<VisitOrderLatLng | null> => {
    if (known[job.id]) return known[job.id];
    let row: any = initialJobs.find((item) => String((item as any).id) === String(job.id)) || job;
    let resolved = await resolveJobLatLngFromRow(row);
    if (resolved) return { lat: resolved.lat, lng: resolved.lng };
    try {
      const { data: full, error } = await db.jobs.getByIdFull(job.id);
      if (!error && full) row = full;
    } catch {
      /* keep cached */
    }
    resolved = await resolveJobLatLngFromRow(row);
    if (resolved) return { lat: resolved.lat, lng: resolved.lng };
    const accessToken = await resolveSupabaseAccessTokenForApi();
    const cust = row?.customer || {};
    const addressHint =
      formatAddressForMapsSearch(cust.address) ||
      String(cust.visible_address || cust.visibleAddress || '').trim() ||
      '';
    const hints = [addressHint, String(cust.full_name || cust.fullName || '').trim()].filter(Boolean);
    if (hints.length) {
      const geocoded = await geocodeFromPlaceHints(hints, accessToken);
      if (geocoded) return { lat: geocoded.geocoded.latitude, lng: geocoded.geocoded.longitude };
    }
    return null;
  };

  const loadPlan = async (
    jobRows: VisitOrderJobRow[],
    pinSeed?: Record<string, VisitOrderLatLng>
  ) => {
    if (!technicianId || jobRows.length === 0) {
      setTechStart(null);
      setPlanLegs([]);
      setReachByJobId({});
      return;
    }
    const gen = ++planGenRef.current;
    setPlanning(true);
    try {
      const start = await resolveTechStart();
      if (planGenRef.current !== gen) return;
      setTechStart(start);
      const nextPins: Record<string, VisitOrderLatLng> = { ...pinsRef.current, ...pinSeed };
      for (const job of jobRows) {
        if (nextPins[job.id]) continue;
        const pin = await resolveJobPin(job, nextPins);
        if (pin) nextPins[job.id] = pin;
      }
      if (planGenRef.current !== gen) return;
      setPins(nextPins);

      const origin = start;
      const orderedPins = jobRows
        .map((job) => (nextPins[job.id] ? { job, pin: nextPins[job.id] } : null))
        .filter((row): row is { job: VisitOrderJobRow; pin: VisitOrderLatLng } => Boolean(row));
      if (!origin || orderedPins.length === 0) {
        setPlanLegs([]);
        setReachByJobId({});
        return;
      }
      if (orderedPins.length > 12) {
        toast.message(`Plan map uses the first 12 of ${orderedPins.length} pinned stops.`);
        orderedPins.splice(12);
      }

      const legs: VisitOrderMapLeg[] = [];
      const raw: Array<{
        jobId: string;
        durationSeconds: number;
        durationText: string;
        distanceMeters: number;
      }> = [];
      let from = origin;
      for (let i = 0; i < orderedPins.length; i++) {
        const stop = orderedPins[i];
        const route = await fetchDrivingRoute(from, stop.pin);
        if (route?.path.length) {
          legs.push({
            path: route.path,
            durationText: route.durationText,
            durationSeconds: route.durationSeconds,
            color: i === 0 ? '#0f766e' : '#0284c7',
          });
          raw.push({
            jobId: stop.job.id,
            durationSeconds: route.durationSeconds,
            durationText: route.durationText,
            distanceMeters: route.distanceMeters,
          });
        }
        from = stop.pin;
      }
      if (planGenRef.current !== gen) return;
      const plan = visitOrderReachPlan(raw);
      if (planGenRef.current !== gen) return;
      setPlanLegs(
        legs.map((leg, index) => ({
          ...leg,
          reachAt: plan[index]?.reachAt,
        }))
      );
      setReachByJobId(Object.fromEntries(plan.map((stop) => [stop.jobId, stop])));
    } finally {
      if (planGenRef.current === gen) setPlanning(false);
    }
  };

  const handleSuggestNearest = async () => {
    if (!technicianId || rows.length < 2) return;
    setPlanning(true);
    let handoffToMap = false;
    try {
      const start = techStart || (await resolveTechStart());
      if (!start) {
        toast.error('Technician location not available. Ping them or use Live location first.');
        return;
      }
      setTechStart(start);
      const nextPins: Record<string, VisitOrderLatLng> = { ...pinsRef.current };
      for (const job of rows) {
        if (nextPins[job.id]) continue;
        const pin = await resolveJobPin(job, nextPins);
        if (pin) nextPins[job.id] = pin;
      }
      setPins(nextPins);
      const next = suggestVisitOrderByNearest(start, rows, (job) => nextPins[job.id] || null);
      const changed = next.some((job, index) => job.id !== rows[index]?.id);
      if (!changed) {
        toast.message('This order is already the nearest route');
        return;
      }
      setRows(next);
      setDirty(true);
      toast.success('Suggested nearest route — Save order to keep it');
      handoffToMap = showMap;
    } finally {
      if (!handoffToMap) setPlanning(false);
    }
  };

  const orderKey = rows.map((job) => job.id).join(',');
  const mapStops = useMemo(
    () =>
      rows.flatMap((job, index) => {
        const pin = pins[job.id];
        if (!pin) return [];
        return [
          {
            id: job.id,
            lat: pin.lat,
            lng: pin.lng,
            index,
            title: visitOrderStopLabel(job),
          } satisfies VisitOrderMapStop,
        ];
      }),
    [rows, pins]
  );

  useEffect(() => {
    if (!open || !showMap) return;
    if (!technicianId || !orderKey) {
      setPlanLegs([]);
      setReachByJobId({});
      return;
    }
    void loadPlan(rows);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- plan from current stop order only
  }, [open, showMap, technicianId, orderKey]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          '!flex flex-col gap-0 overflow-hidden p-0',
          '!w-[calc(100vw-1rem)] !max-w-[calc(100vw-1rem)]',
          'sm:!w-full',
          showMap ? 'sm:!max-w-5xl' : 'sm:!max-w-lg',
          'max-h-[min(92dvh,92vh)] sm:max-h-[90vh]',
          showMap && 'sm:min-h-[min(85vh,720px)]',
          '!top-[max(0.5rem,env(safe-area-inset-top,0px))] !translate-y-0',
          'sm:!top-[50%] sm:!translate-y-[-50%]',
          'rounded-xl sm:rounded-lg',
          '[&>button]:z-10 [&>button]:!right-3 [&>button]:!top-3',
          '[&>button]:h-10 [&>button]:w-10 sm:[&>button]:h-8 sm:[&>button]:w-8'
        )}
      >
        <DialogHeader className="shrink-0 space-y-1 border-b px-4 pb-3 pt-4 pr-14 text-left sm:px-6 sm:pt-5 sm:pr-14">
          <DialogTitle className="flex items-center gap-2 text-base sm:text-lg">
            <ListOrdered className="h-5 w-5 shrink-0 text-sky-700" />
            Arrange visit order
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground sm:text-sm">
            Pick a technician, drag stops, and use the plan map for reach times. Suggest nearest to tighten the route.
          </DialogDescription>
        </DialogHeader>

        <div
          className={cn(
            'flex min-h-0 flex-1',
            showMap ? 'flex-col overflow-y-auto md:flex-row md:overflow-hidden' : 'flex-col overflow-hidden'
          )}
        >
          <div
            className={cn(
              'flex min-w-0 flex-col gap-3 px-4 py-3 sm:gap-4 sm:px-6 sm:py-4',
              showMap
                ? 'flex-none md:min-h-0 md:flex-1 md:overflow-hidden'
                : 'min-h-0 flex-1 overflow-hidden'
            )}
          >
          <div className="shrink-0 space-y-1.5">
            <Label htmlFor="visit-order-tech" className="text-sm">
              Technician
            </Label>
            <Select
              value={technicianId || undefined}
              onValueChange={(v) => {
                setTechnicianId(v);
                setPins({});
                setPlanLegs([]);
                setReachByJobId({});
                setTechStart(null);
                void loadJobs(v, { silentCacheFirst: true });
              }}
            >
              <SelectTrigger id="visit-order-tech" className="h-12 w-full text-base sm:h-10 sm:text-sm">
                <SelectValue placeholder="Select technician" />
              </SelectTrigger>
              <SelectContent>
                {activeTechs.map((t) => (
                  <SelectItem key={t.id} value={t.id} className="min-h-12 text-base sm:min-h-0 sm:text-sm">
                    {techLabel(t)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid shrink-0 grid-cols-2 gap-2">
            <Button
              type="button"
              variant="outline"
              className={cn(
                'h-12 w-full cursor-pointer rounded-xl px-2.5 text-[13px] font-semibold shadow-none transition-colors duration-150 sm:h-11 sm:text-sm',
                showMap
                  ? 'border-sky-700 bg-sky-700 text-white hover:bg-sky-800 hover:text-white'
                  : 'border-sky-200 bg-sky-50 text-sky-950 hover:border-sky-300 hover:bg-sky-100 hover:text-sky-950'
              )}
              disabled={!showMap && (!technicianId || rows.length === 0)}
              onClick={() => setShowMap((on) => !on)}
            >
              <span
                className={cn(
                  'flex h-7 w-7 items-center justify-center rounded-lg',
                  showMap ? 'bg-white/20' : 'bg-sky-600/15'
                )}
              >
                <Map className="h-4 w-4" />
              </span>
              {showMap ? 'Hide map' : 'Plan map'}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-12 w-full cursor-pointer rounded-xl border-teal-200 bg-teal-50 px-2.5 text-[13px] font-semibold text-teal-950 shadow-none transition-colors duration-150 hover:border-teal-300 hover:bg-teal-100 hover:text-teal-950 sm:h-11 sm:text-sm"
              disabled={!technicianId || rows.length < 2 || planning || saving}
              onClick={() => void handleSuggestNearest()}
            >
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-teal-600/15">
                {planning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Route className="h-4 w-4" />}
              </span>
              Suggest nearest
            </Button>
          </div>

          <div className="flex shrink-0 items-center justify-between gap-3 rounded-lg border border-sky-100 bg-sky-50/70 px-3 py-2.5">
            <div className="min-w-0">
              <Label htmlFor="visit-order-visible" className="text-sm font-medium text-sky-950">
                Show order on this technician&apos;s app
              </Label>
              <p className="text-[11px] text-sky-900/70 sm:text-xs">
                Off by default — on only for today (IST); turns off automatically tomorrow.
              </p>
            </div>
            <Switch
              id="visit-order-visible"
              checked={showOnTechApp}
              disabled={togglingVisibility || !technicianId}
              onCheckedChange={(v) => void handleVisibilityToggle(v)}
            />
          </div>

          <p className="shrink-0 text-xs text-muted-foreground sm:text-sm">
            {loading
              ? 'Loading…'
              : `${rows.length} open job${rows.length === 1 ? '' : 's'}`}
            {!loading && dirty ? ' · unsaved' : ''}
            {planning ? ' · road times…' : ''}
            {!planning &&
            rows.some((job) => reachByJobId[job.id]?.cumulativeSeconds)
              ? ` · ${formatVisitOrderDrive(
                  Math.max(
                    0,
                    ...rows.map((job) => reachByJobId[job.id]?.cumulativeSeconds || 0)
                  )
                )} if they leave now`
              : ''}
          </p>

          <div
            ref={scrollContainerRef}
            className={cn(
              'overflow-y-auto overscroll-contain rounded-lg border border-gray-100 bg-slate-50/60 -mx-0 px-1.5 py-1.5 sm:px-2 sm:py-2',
              showMap ? 'max-md:flex-none md:min-h-0 md:flex-1' : 'min-h-0 flex-1'
            )}
            onDragOver={(event) => {
              if (dragIndex === null) return;
              event.preventDefault();
              trackPointer(event.clientY);
            }}
          >
            {loading && rows.length === 0 ? (
              <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                Loading jobs…
              </div>
            ) : rows.length === 0 ? (
              <div className="rounded-md border border-dashed border-gray-200 bg-white px-4 py-10 text-center text-sm text-muted-foreground">
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
                        'relative flex items-stretch gap-2 rounded-xl border bg-white p-3 shadow-sm transition-[opacity,box-shadow,border-color] duration-150 select-none sm:items-center sm:rounded-lg sm:p-2.5',
                        isDragging && 'opacity-40 border-dashed border-sky-300 bg-sky-50/40 shadow-none',
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
                        draggable={!saving && !openingMaps}
                        onDragStart={(e) => handleDragStart(index, e)}
                        onDragEnd={clearDragState}
                        className={cn(
                          'flex w-10 shrink-0 touch-none items-center justify-center self-center rounded-lg text-muted-foreground sm:h-9 sm:w-9',
                          !saving &&
                            !openingMaps &&
                            'cursor-grab active:bg-slate-100 active:cursor-grabbing',
                          (saving || openingMaps) && 'opacity-50'
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
                          'flex h-9 w-9 shrink-0 items-center justify-center self-center rounded-full text-sm font-semibold sm:h-8 sm:w-8',
                          index === 0
                            ? 'bg-red-600 text-white ring-2 ring-red-200'
                            : 'bg-sky-100 text-sky-800'
                        )}
                      >
                        {index + 1}
                      </span>

                      <div className="min-w-0 flex-1 py-0.5">
                        <div className="text-[15px] font-medium leading-snug text-gray-900 break-words sm:text-sm">
                          {visitOrderStopLabel(job)}
                        </div>
                        <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                          <span className="truncate max-w-full">{job.job_number || '—'}</span>
                          {status ? (
                            <Badge
                              variant="outline"
                              className="h-5 shrink-0 px-1.5 py-0 text-[10px]"
                            >
                              {status.replace('_', ' ')}
                            </Badge>
                          ) : null}
                          {job.scheduled_time_slot ? (
                            <span className="shrink-0">
                              {String(job.scheduled_time_slot).replace('_', ' ')}
                            </span>
                          ) : null}
                          {reachByJobId[job.id]?.reachAt ? (
                            <span className="shrink-0 font-medium text-sky-800">
                              Reach {reachByJobId[job.id].reachAt}
                              {reachByJobId[job.id].durationText
                                ? ` · ${reachByJobId[job.id].durationText} drive`
                                : ''}
                            </span>
                          ) : pins[job.id] ? null : showMap ? (
                            <span className="shrink-0">No map pin</span>
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
          {showMap ? (
            <div className="relative h-[240px] min-h-[200px] w-full shrink-0 overflow-hidden border-t md:h-auto md:min-h-0 md:w-[48%] md:flex-none md:border-l md:border-t-0">
              <VisitOrderPlanMap tech={techStart} stops={mapStops} legs={planLegs} />
              {planning ? (
                <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/50 text-sm text-muted-foreground">
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Loading reach times…
                </div>
              ) : null}
            </div>
          ) : null}
        </div>

        <DialogFooter
          className={cn(
            'shrink-0 gap-2 border-t bg-background px-4 py-3 sm:px-6',
            'pb-[max(0.75rem,env(safe-area-inset-bottom,0px))]',
            'flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between'
          )}
        >
          <Button
            type="button"
            variant="ghost"
            className="h-11 w-full text-muted-foreground hover:text-foreground sm:h-9 sm:w-auto sm:px-3"
            onClick={() => onOpenChange(false)}
            disabled={saving || openingMaps}
          >
            Cancel
          </Button>
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center sm:gap-2.5">
            <Button
              type="button"
              variant="outline"
              className="h-11 w-full border-gray-300 bg-white text-gray-900 hover:bg-gray-50 sm:h-9 sm:w-auto sm:min-w-[7.5rem] disabled:opacity-40"
              onClick={() => void handleSave()}
              disabled={!technicianId || rows.length === 0 || saving || !dirty || openingMaps}
            >
              {saving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving…
                </>
              ) : (
                'Save order'
              )}
            </Button>
            <Button
              type="button"
              className="h-11 w-full bg-sky-700 text-base shadow-sm hover:bg-sky-800 sm:h-9 sm:w-auto sm:min-w-[11.5rem] sm:text-sm"
              onClick={() => void handleOpenRouteInMaps()}
              disabled={!technicianId || rows.length === 0 || saving || openingMaps || loading}
            >
              {openingMaps ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Opening Maps…
                </>
              ) : (
                <>
                  <MapPinned className="mr-2 h-4 w-4" />
                  Open route in Maps
                </>
              )}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
