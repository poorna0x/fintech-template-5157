import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ExternalLink, Loader2, MapPinned, Navigation, RefreshCw, UserRound } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { supabase } from '@/lib/supabase';
import type { RealtimeChannel } from '@supabase/supabase-js';
import type { Technician } from '@/types';
import DraggableMap from '@/components/DraggableMap';
import { fetchDrivingRoute } from '@/lib/googleMapsDistance';
import { openGoogleMapsDirectionsBetween } from '@/lib/maps';
import {
  buildJobsMapTechs,
  fetchJobsMapLiveRows,
  fetchOngoingJobsForMap,
  filterJobsMapJobs,
  formatJobsMapDistance,
  isJobsMapFixFresh,
  jobsForTechnician,
  jobsMapStatusColor,
  jobsMapStatusLabel,
  jobsMapStatusShort,
  nearestTechsForJob,
  parseJobsMapJobs,
  techsNearJobs,
  type JobsMapFilter,
  type JobsMapJob,
  type JobsMapLiveRow,
  type JobsMapTech,
} from '@/lib/adminJobsMap';

const BENGALURU = { lat: 12.9716, lng: 77.5946 };
const FILTERS: Array<{ id: JobsMapFilter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'unassigned', label: 'Unassigned' },
  { id: 'ASSIGNED', label: 'Assigned' },
  { id: 'EN_ROUTE', label: 'En route' },
  { id: 'IN_PROGRESS', label: 'In progress' },
];

type Selection = { kind: 'job'; id: string } | { kind: 'tech'; id: string } | null;

type DrawnRoute = {
  fromId: string;
  toId: string;
  path: google.maps.LatLngLiteral[];
  distanceMeters: number;
  durationText: string;
  color: string;
};

const MAX_JOB_ROUTES = 4;
const MAX_TECH_ROUTES = 4;

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  technicians: Technician[];
  initialJobs?: unknown[];
  onAssignJob?: (jobId: string) => void;
};

function agoLabel(iso: string | null): string {
  if (!iso) return 'no recent fix';
  const secs = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  return `${hours}h ago`;
}

function markerIcon(fill: string, label: string, square = false): google.maps.Icon {
  const shape = square
    ? `<rect x="4" y="4" width="28" height="28" rx="7" fill="${fill}" stroke="white" stroke-width="3"/>`
    : `<circle cx="18" cy="18" r="14" fill="${fill}" stroke="white" stroke-width="3"/>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 36 36">${shape}<text x="18" y="22.5" text-anchor="middle" fill="white" font-size="11" font-family="system-ui,sans-serif" font-weight="700">${label}</text></svg>`;
  return {
    url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
    scaledSize: new google.maps.Size(36, 36),
    anchor: new google.maps.Point(18, 18),
  };
}

export default function JobsMapToolDialog({
  open,
  onOpenChange,
  technicians,
  initialJobs,
  onAssignJob,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [jobs, setJobs] = useState<JobsMapJob[]>([]);
  const [missingPins, setMissingPins] = useState(0);
  const [liveRows, setLiveRows] = useState<JobsMapLiveRow[]>([]);
  const [filter, setFilter] = useState<JobsMapFilter>('all');
  const [selection, setSelection] = useState<Selection>(null);
  const [pingingId, setPingingId] = useState<string | null>(null);
  const [routes, setRoutes] = useState<DrawnRoute[]>([]);
  const [routing, setRouting] = useState(false);
  const [mapReady, setMapReady] = useState(false);

  const mapRef = useRef<google.maps.Map | null>(null);
  const overlaysRef = useRef<google.maps.MVCObject[]>([]);
  const routeOverlaysRef = useRef<google.maps.Polyline[]>([]);
  const fitKeyRef = useRef('');
  const jobsRef = useRef(jobs);
  const techsRef = useRef<JobsMapTech[]>([]);
  const selectionRef = useRef(selection);
  const channelRef = useRef<RealtimeChannel | null>(null);
  jobsRef.current = jobs;
  selectionRef.current = selection;

  const techs = useMemo(() => buildJobsMapTechs(technicians, liveRows), [technicians, liveRows]);
  techsRef.current = techs;

  const visibleJobs = useMemo(() => filterJobsMapJobs(jobs, filter), [jobs, filter]);
  const selectedJob = selection?.kind === 'job' ? jobs.find((job) => job.id === selection.id) || null : null;
  const selectedTech = selection?.kind === 'tech' ? techs.find((tech) => tech.id === selection.id) || null : null;
  const nearby = selectedJob
    ? nearestTechsForJob(selectedJob, techs).filter((tech) => tech.isAssigned || tech.distance_m <= 40_000)
    : [];
  const techJobs = selectedTech ? jobsForTechnician(jobs, selectedTech.id) : [];
  const unassignedCount = jobs.filter((job) => job.status === 'PENDING' || !job.assigned_technician_id).length;
  const liveCount = techs.filter((tech) => tech.source === 'live' && isJobsMapFixFresh(tech.updatedAt)).length;

  const initialJobsRef = useRef(initialJobs);
  initialJobsRef.current = initialJobs;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const fromDash = parseJobsMapJobs(initialJobsRef.current || []);
      const [live, fetched] =
        fromDash.jobs.length > 0
          ? [await fetchJobsMapLiveRows(), { jobs: fromDash.jobs, missing: fromDash.missing, error: null }]
          : await Promise.all([fetchJobsMapLiveRows(), fetchOngoingJobsForMap()]);
      if (fetched.error) toast.error(fetched.error);
      setJobs(fetched.jobs);
      setMissingPins(fetched.missing);
      setLiveRows(live);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    setFilter('all');
    setSelection(null);
    fitKeyRef.current = '';
    void load();
  }, [open, load]);

  useEffect(() => {
    if (!open) return;
    const channel = supabase
      .channel('jobs-map-live')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'technician_live_locations' },
        (payload) => {
          const row = (payload.new || payload.old) as JobsMapLiveRow | undefined;
          if (!row?.technician_id) return;
          setLiveRows((prev) => {
            const next = prev.filter((item) => item.technician_id !== row.technician_id);
            if (payload.eventType === 'DELETE') return next;
            return [...next, row];
          });
        }
      )
      .subscribe();
    channelRef.current = channel;
    return () => {
      void supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [open]);

  const clearOverlays = () => {
    for (const overlay of overlaysRef.current) {
      (overlay as google.maps.Marker).setMap(null);
    }
    overlaysRef.current = [];
  };

  const clearRouteOverlays = () => {
    for (const line of routeOverlaysRef.current) line.setMap(null);
    routeOverlaysRef.current = [];
  };

  const routeFor = (fromId: string, toId: string) =>
    routes.find((route) => route.fromId === fromId && route.toId === toId);

  const routeCaption = (fromId: string, toId: string) => {
    const route = routeFor(fromId, toId);
    if (route) {
      return `${formatJobsMapDistance(route.distanceMeters)}${route.durationText ? ` · ${route.durationText}` : ''}`;
    }
    return routing ? 'Road…' : 'No road route';
  };

  const paint = useCallback(() => {
    const map = mapRef.current;
    if (!map || !window.google?.maps) return;
    clearOverlays();
    const shownJobs = filterJobsMapJobs(jobsRef.current, filter);
    const fitTechs = techsNearJobs(shownJobs, techsRef.current);
    const bounds = new window.google.maps.LatLngBounds();
    let hasPoint = false;
    const sel = selectionRef.current;

    const addMarker = (
      position: { lat: number; lng: number },
      icon: google.maps.Icon,
      title: string,
      zIndex: number,
      onClick: () => void,
      includeInFit: boolean
    ) => {
      const marker = new window.google.maps.Marker({
        map,
        position,
        icon,
        title,
        zIndex,
      });
      marker.addListener('click', onClick);
      overlaysRef.current.push(marker);
      if (includeInFit) {
        bounds.extend(position);
        hasPoint = true;
      }
    };

    const fitTechIds = new Set(fitTechs.map((tech) => tech.id));

    for (const job of shownJobs) {
      const selected = sel?.kind === 'job' && sel.id === job.id;
      addMarker(
        { lat: job.lat, lng: job.lng },
        markerIcon(jobsMapStatusColor(job.status), jobsMapStatusShort(job.status)),
        `${job.job_number || 'Job'} · ${job.customer_name}`,
        selected ? 24 : 8,
        () => setSelection({ kind: 'job', id: job.id }),
        true
      );
    }

    for (const tech of techsRef.current) {
      const selected = sel?.kind === 'tech' && sel.id === tech.id;
      const fresh = isJobsMapFixFresh(tech.updatedAt);
      addMarker(
        { lat: tech.lat, lng: tech.lng },
        markerIcon(fresh ? '#0f766e' : '#94a3b8', tech.name.slice(0, 1).toUpperCase() || 'T', true),
        `${tech.name} · ${agoLabel(tech.updatedAt)}`,
        selected ? 26 : 12,
        () => setSelection({ kind: 'tech', id: tech.id }),
        fitTechIds.has(tech.id)
      );
    }

    const fitKey = `${visibleJobs.length}:${techsRef.current.length}:${filter}`;
    if (hasPoint && fitKeyRef.current !== fitKey && !sel) {
      fitKeyRef.current = fitKey;
      try {
        map.fitBounds(bounds, 48);
      } catch {
        /* ignore */
      }
    }
  }, [filter, visibleJobs.length]);

  useEffect(() => {
    paint();
  }, [paint, jobs, techs, selection]);

  useEffect(() => {
    if (!open) {
      setRoutes([]);
      setRouting(false);
      setMapReady(false);
      clearRouteOverlays();
      return;
    }
    if (!selection || !mapReady) {
      if (!selection) {
        setRoutes([]);
        setRouting(false);
        clearRouteOverlays();
      }
      return;
    }

    const pairs: Array<{ fromId: string; toId: string; origin: { lat: number; lng: number }; dest: { lat: number; lng: number }; color: string }> =
      [];
    if (selection.kind === 'job') {
      const job = jobsRef.current.find((row) => row.id === selection.id);
      if (job) {
        for (const tech of nearestTechsForJob(job, techsRef.current)
          .filter((row) => row.isAssigned || row.distance_m <= 40_000)
          .slice(0, MAX_JOB_ROUTES)) {
          pairs.push({
            fromId: tech.id,
            toId: job.id,
            origin: { lat: tech.lat, lng: tech.lng },
            dest: { lat: job.lat, lng: job.lng },
            color: tech.isAssigned ? '#2563eb' : '#0f766e',
          });
        }
      }
    } else {
      const tech = techsRef.current.find((row) => row.id === selection.id);
      if (tech) {
        for (const job of jobsForTechnician(jobsRef.current, tech.id).slice(0, MAX_TECH_ROUTES)) {
          pairs.push({
            fromId: tech.id,
            toId: job.id,
            origin: { lat: tech.lat, lng: tech.lng },
            dest: { lat: job.lat, lng: job.lng },
            color: jobsMapStatusColor(job.status),
          });
        }
      }
    }

    if (!pairs.length) {
      setRoutes([]);
      setRouting(false);
      return;
    }

    let cancelled = false;
    setRouting(true);
    setRoutes([]);
    void Promise.all(
      pairs.map(async (pair) => {
        const route = await fetchDrivingRoute(pair.origin, pair.dest);
        if (!route?.path.length) return null;
        return {
          fromId: pair.fromId,
          toId: pair.toId,
          path: route.path,
          distanceMeters: route.distanceMeters,
          durationText: route.durationText,
          color: pair.color,
        } satisfies DrawnRoute;
      })
    ).then((rows) => {
      if (cancelled) return;
      const drawn = rows.filter((row): row is DrawnRoute => Boolean(row));
      setRoutes(drawn);
      setRouting(false);
      if (!drawn.length) toast.error('Could not load a road route');
    })
    .catch(() => {
      if (cancelled) return;
      setRoutes([]);
      setRouting(false);
      toast.error('Could not load a road route');
    });

    return () => {
      cancelled = true;
    };
  }, [open, selection, mapReady]);

  useEffect(() => {
    const map = mapRef.current;
    clearRouteOverlays();
    if (!map || !window.google?.maps || !routes.length) return;
    const bounds = new window.google.maps.LatLngBounds();
    for (const route of routes) {
      const line = new window.google.maps.Polyline({
        map,
        path: route.path,
        strokeColor: route.color,
        strokeOpacity: 0.95,
        strokeWeight: 6,
        zIndex: 7,
      });
      routeOverlaysRef.current.push(line);
      for (const point of route.path) bounds.extend(point);
    }
    try {
      map.fitBounds(bounds, 64);
    } catch {
      /* ignore */
    }
  }, [routes, mapReady]);

  const pingTech = async (technicianId: string) => {
    setPingingId(technicianId);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) {
        toast.error('Sign in again to ping location');
        return;
      }
      const res = await fetch('/.netlify/functions/send-location-ping', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ technicianId }),
      });
      if (!res.ok) {
        toast.error('Could not ping the technician phone');
        return;
      }
      toast.message('Asked the phone for a fresh pin');
    } catch {
      toast.error('Could not ping the technician phone');
    } finally {
      setPingingId(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[min(92dvh,920px)] max-h-[92dvh] w-[calc(100vw-1rem)] max-w-6xl flex-col gap-0 overflow-hidden p-0 sm:max-w-6xl">
        <DialogHeader className="shrink-0 space-y-1 border-b px-4 py-3 sm:px-5">
          <DialogTitle className="flex items-center gap-2 text-base sm:text-lg">
            <MapPinned className="h-5 w-5 text-sky-700" />
            Jobs map
          </DialogTitle>
          <DialogDescription className="text-xs sm:text-sm">
            {jobs.length} ongoing with pins
            {unassignedCount ? ` · ${unassignedCount} unassigned` : ''}
            {liveCount ? ` · ${liveCount} techs live` : ` · ${techs.length} tech pins`}
            {missingPins ? ` · ${missingPins} jobs have no map pin` : ''}
          </DialogDescription>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col md:flex-row">
          <div className="relative min-h-[220px] flex-1 overflow-hidden bg-muted md:order-2">
            <DraggableMap
              center={BENGALURU}
              zoom={11}
              height="100%"
              hideMarker
              gestureHandling="greedy"
              mapTypeControl={false}
              streetViewControl={false}
              fullscreenControl={false}
              onMapReady={(map) => {
                mapRef.current = map;
                setMapReady(true);
                paint();
              }}
            />
            {loading ? (
              <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/40">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : null}
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="absolute right-3 top-3 z-20 h-11 cursor-pointer gap-1.5"
              onClick={() => void load()}
              disabled={loading}
            >
              <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
              Refresh
            </Button>
          </div>

          <div className="flex max-h-[46dvh] min-h-0 w-full flex-col overflow-y-auto border-t md:order-1 md:max-h-none md:w-[min(100%,22rem)] md:flex-none md:border-r md:border-t-0">
            <div className="flex flex-wrap gap-1.5 border-b px-3 py-2">
              {FILTERS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setFilter(item.id);
                    setSelection(null);
                    fitKeyRef.current = '';
                  }}
                  className={cn(
                    'h-9 cursor-pointer rounded-full border px-3 text-xs font-medium',
                    filter === item.id
                      ? 'border-foreground bg-foreground text-background'
                      : 'border-border bg-card text-muted-foreground hover:bg-muted/70'
                  )}
                >
                  {item.label}
                </button>
              ))}
            </div>

            {selectedJob ? (
              <div className="space-y-3 border-b px-3 py-3">
                <p className="text-sm font-semibold text-foreground">
                  {selectedJob.job_number || 'Job'} · {selectedJob.customer_name}
                </p>
                <p className="text-xs text-muted-foreground">
                  {jobsMapStatusLabel(selectedJob.status)}
                  {selectedJob.visible_address ? ` · ${selectedJob.visible_address}` : ''}
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-11 cursor-pointer"
                    onClick={() =>
                      window.open(
                        `https://www.google.com/maps?q=${selectedJob.lat},${selectedJob.lng}`,
                        '_blank',
                        'noopener,noreferrer'
                      )
                    }
                  >
                    <ExternalLink className="mr-1 h-4 w-4" />
                    Maps
                  </Button>
                  {onAssignJob && (selectedJob.status === 'PENDING' || !selectedJob.assigned_technician_id) ? (
                    <Button
                      type="button"
                      size="sm"
                      className="h-11 cursor-pointer"
                      onClick={() => onAssignJob(selectedJob.id)}
                    >
                      Assign
                    </Button>
                  ) : null}
                </div>
                <p className="text-xs font-medium text-muted-foreground">
                  Nearby technicians{routing ? ' · loading road' : ''}
                </p>
                {nearby.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No technician pins yet.</p>
                ) : (
                  <ul className="space-y-1.5">
                    {nearby.map((tech) => (
                      <li key={tech.id}>
                        <button
                          type="button"
                          className="flex w-full cursor-pointer items-center justify-between gap-2 rounded-lg border border-border px-2.5 py-2 text-left hover:bg-muted/50"
                          onClick={() => setSelection({ kind: 'tech', id: tech.id })}
                        >
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-medium">
                              {tech.name}
                              {tech.isAssigned ? ' · assigned' : ''}
                            </span>
                            <span className="block text-xs text-muted-foreground">
                              {routeCaption(tech.id, selectedJob.id)} · {agoLabel(tech.updatedAt)}
                            </span>
                          </span>
                          <Navigation className="h-4 w-4 shrink-0 text-muted-foreground" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {nearby[0] ? (
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="h-11 w-full cursor-pointer"
                    onClick={() =>
                      openGoogleMapsDirectionsBetween(
                        { lat: nearby[0].lat, lng: nearby[0].lng },
                        { lat: selectedJob.lat, lng: selectedJob.lng },
                        'driving'
                      )
                    }
                  >
                    Directions from {nearby[0].name}
                  </Button>
                ) : null}
              </div>
            ) : null}

            {selectedTech ? (
              <div className="space-y-3 border-b px-3 py-3">
                <p className="flex items-center gap-2 text-sm font-semibold">
                  <UserRound className="h-4 w-4" />
                  {selectedTech.name}
                </p>
                <p className="text-xs text-muted-foreground">
                  {selectedTech.source === 'live' ? 'Live GPS' : 'Last known'} · {agoLabel(selectedTech.updatedAt)}
                  {techJobs.length ? ` · ${techJobs.length} open jobs` : ''}
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-11 cursor-pointer"
                    disabled={pingingId === selectedTech.id}
                    onClick={() => void pingTech(selectedTech.id)}
                  >
                    {pingingId === selectedTech.id ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
                    Ping location
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-11 cursor-pointer"
                    onClick={() =>
                      window.open(
                        `https://www.google.com/maps?q=${selectedTech.lat},${selectedTech.lng}`,
                        '_blank',
                        'noopener,noreferrer'
                      )
                    }
                  >
                    Maps
                  </Button>
                </div>
                {techJobs.length ? (
                  <ul className="space-y-1.5">
                    {techJobs.map((job) => (
                      <li key={job.id}>
                        <button
                          type="button"
                          className="flex w-full cursor-pointer items-center justify-between rounded-lg border px-2.5 py-2 text-left hover:bg-muted/50"
                          onClick={() => setSelection({ kind: 'job', id: job.id })}
                        >
                          <span className="truncate text-sm">
                            {job.job_number || 'Job'} · {job.customer_name}
                          </span>
                          <span className="shrink-0 text-xs text-muted-foreground">
                            {routeCaption(selectedTech.id, job.id)}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-muted-foreground">No open jobs assigned to this technician.</p>
                )}
              </div>
            ) : null}

            <ul className="space-y-1 px-3 py-2 pb-8">
              {visibleJobs.length === 0 && !loading ? (
                <li className="rounded-xl border border-dashed px-3 py-8 text-center text-sm text-muted-foreground">
                  No ongoing jobs with map pins
                  {filter !== 'all' ? ' in this filter' : ''}.
                </li>
              ) : (
                visibleJobs.map((job) => {
                  const isSel = selectedJob?.id === job.id;
                  return (
                    <li key={job.id}>
                      <button
                        type="button"
                        onClick={() => {
                          setSelection({ kind: 'job', id: job.id });
                          mapRef.current?.panTo({ lat: job.lat, lng: job.lng });
                        }}
                        className={cn(
                          'flex min-h-12 w-full cursor-pointer items-center gap-2 rounded-xl border px-3 py-2.5 text-left',
                          isSel ? 'shadow-sm' : 'border-border bg-card hover:bg-muted/50'
                        )}
                        style={
                          isSel
                            ? { borderColor: jobsMapStatusColor(job.status), backgroundColor: `${jobsMapStatusColor(job.status)}14` }
                            : undefined
                        }
                      >
                        <span
                          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white"
                          style={{ backgroundColor: jobsMapStatusColor(job.status) }}
                        >
                          {jobsMapStatusShort(job.status)}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">
                            {job.job_number || 'Job'} · {job.customer_name}
                          </span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {jobsMapStatusLabel(job.status)}
                            {job.visible_address ? ` · ${job.visible_address}` : ''}
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })
              )}
            </ul>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
