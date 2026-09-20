import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Car, ExternalLink, Loader2, LocateFixed, MapPinned, Moon, Navigation, Radio, RefreshCw, Search, Sun } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { supabase } from '@/lib/supabase';
import type { RealtimeChannel } from '@supabase/supabase-js';
import type { Technician } from '@/types';
import DraggableMap from '@/components/DraggableMap';
import { DARK_DISPATCH_BG, DARK_DISPATCH_MAP_STYLES } from '@/lib/darkMapStyle';
import { fetchDrivingRoute } from '@/lib/googleMapsDistance';
import { openGoogleMapsDirectionsBetween } from '@/lib/maps';
import {
  buildJobsMapTechs,
  fetchJobsMapLastLocations,
  fetchJobsMapLiveRows,
  fetchOngoingJobsForMap,
  filterJobsMapJobs,
  formatJobsMapDistance,
  isJobsMapFixFresh,
  isJobsMapFollowUpStatus,
  jobsForTechnician,
  jobsMapCameraJobs,
  jobsMapDueLabel,
  jobsMapFitPoints,
  jobsMapStatusColor,
  jobsMapSuggestedZoom,
  jobsMapStatusLabel,
  jobsMapStatusShort,
  jobsMapTechPhotoThumb,
  nearestTechsForJob,
  parseJobsMapJobs,
  searchJobsMapJobs,
  techsNearJobs,
  visibleTechsForJobsMap,
  type JobsMapFilter,
  type JobsMapJob,
  type JobsMapLastLoc,
  type JobsMapLiveRow,
  type JobsMapTech,
} from '@/lib/adminJobsMap';

const BENGALURU = { lat: 12.9716, lng: 77.5946 };

function applyJobsMapCamera(
  map: google.maps.Map,
  points: Array<{ lat: number; lng: number }>,
  idleRef: { current: google.maps.MapsEventListener | null }
) {
  if (!points.length || !window.google?.maps) return;
  if (idleRef.current) {
    window.google.maps.event.removeListener(idleRef.current);
    idleRef.current = null;
  }
  const wanted = jobsMapSuggestedZoom(points);
  if (points.length === 1) {
    map.setCenter(points[0]);
    map.setZoom(wanted);
    return;
  }
  const bounds = new window.google.maps.LatLngBounds();
  for (const point of points) bounds.extend(point);
  map.fitBounds(bounds, { top: 88, right: 56, bottom: 52, left: 12 });
  idleRef.current = window.google.maps.event.addListenerOnce(map, 'idle', () => {
    idleRef.current = null;
    const zoom = map.getZoom();
    if (zoom == null) return;
    if (zoom < wanted) map.setZoom(wanted);
    else if (zoom > 16) map.setZoom(16);
  });
}
const FILTERS: Array<{ id: JobsMapFilter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'followup', label: 'Follow-up' },
  { id: 'due-today', label: 'Due today' },
  { id: 'unassigned', label: 'Unassigned' },
  { id: 'ASSIGNED', label: 'Assigned' },
  { id: 'EN_ROUTE', label: 'En route' },
  { id: 'IN_PROGRESS', label: 'In progress' },
];

function readJobsMapPref(key: string, fallback: boolean): boolean {
  try {
    const raw = sessionStorage.getItem(`hro-jobs-map-${key}`);
    if (raw === '1') return true;
    if (raw === '0') return false;
  } catch {
    /* ignore */
  }
  return fallback;
}

function writeJobsMapPref(key: string, value: boolean) {
  try {
    sessionStorage.setItem(`hro-jobs-map-${key}`, value ? '1' : '0');
  } catch {
    /* ignore */
  }
}

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
  initialFollowUpJobs?: unknown[];
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

const photoIconCache = new Map<string, google.maps.Icon>();

function techMarkerIcon(tech: { name: string; photo: string | null }): google.maps.Icon {
  const thumb = tech.photo ? jobsMapTechPhotoThumb(tech.photo) : '';
  if (!thumb) {
    return markerIcon('#0f766e', tech.name.slice(0, 1).toUpperCase() || 'T', true);
  }
  const cached = photoIconCache.get(thumb);
  if (cached) return cached;
  const icon: google.maps.Icon = {
    url: thumb,
    scaledSize: new google.maps.Size(48, 48),
    anchor: new google.maps.Point(24, 24),
  };
  photoIconCache.set(thumb, icon);
  return icon;
}

function TechPhoto({ url, name, className }: { url: string | null; name: string; className?: string }) {
  const thumb = url ? jobsMapTechPhotoThumb(url) : '';
  if (thumb) {
    return (
      <img
        src={thumb}
        alt=""
        className={cn('h-8 w-8 shrink-0 rounded-full bg-muted object-cover', className)}
        loading="lazy"
        decoding="async"
      />
    );
  }
  return (
    <span
      className={cn(
        'flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-teal-700 text-xs font-semibold text-white',
        className
      )}
    >
      {name.slice(0, 1).toUpperCase() || 'T'}
    </span>
  );
}

export default function JobsMapToolDialog({
  open,
  onOpenChange,
  technicians,
  initialJobs,
  initialFollowUpJobs,
  onAssignJob,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [jobs, setJobs] = useState<JobsMapJob[]>([]);
  const [missingPins, setMissingPins] = useState(0);
  const [liveRows, setLiveRows] = useState<JobsMapLiveRow[]>([]);
  const [lastKnown, setLastKnown] = useState<JobsMapLastLoc[]>([]);
  const [filter, setFilter] = useState<JobsMapFilter>('all');
  const [selection, setSelection] = useState<Selection>(null);
  const [pingingId, setPingingId] = useState<string | null>(null);
  const [routes, setRoutes] = useState<DrawnRoute[]>([]);
  const [routing, setRouting] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const [query, setQuery] = useState('');
  const [darkMap, setDarkMap] = useState(() => readJobsMapPref('dark', true));
  const [liveOnly, setLiveOnly] = useState(() => readJobsMapPref('livegps', false));
  const [trafficOn, setTrafficOn] = useState(() => readJobsMapPref('traffic', false));

  const mapRef = useRef<google.maps.Map | null>(null);
  const overlaysRef = useRef<google.maps.MVCObject[]>([]);
  const routeOverlaysRef = useRef<google.maps.Polyline[]>([]);
  const trafficRef = useRef<google.maps.TrafficLayer | null>(null);
  const mapClickRef = useRef<google.maps.MapsEventListener | null>(null);
  const fitKeyRef = useRef('');
  const forceFitRef = useRef(false);
  const cameraIdleRef = useRef<google.maps.MapsEventListener | null>(null);
  const paintRef = useRef<() => void>(() => undefined);
  const jobsRef = useRef(jobs);
  const techsRef = useRef<JobsMapTech[]>([]);
  const selectionRef = useRef(selection);
  const filterRef = useRef(filter);
  const queryRef = useRef(query);
  const liveOnlyRef = useRef(liveOnly);
  const techniciansRef = useRef(technicians);
  const channelRef = useRef<RealtimeChannel | null>(null);
  jobsRef.current = jobs;
  selectionRef.current = selection;
  filterRef.current = filter;
  queryRef.current = query;
  liveOnlyRef.current = liveOnly;
  techniciansRef.current = technicians;

  const techs = useMemo(
    () => buildJobsMapTechs(technicians, liveRows, lastKnown),
    [technicians, liveRows, lastKnown]
  );
  techsRef.current = techs;

  const visibleJobs = useMemo(
    () => searchJobsMapJobs(filterJobsMapJobs(jobs, filter), query),
    [jobs, filter, query]
  );
  const visibleTechs = useMemo(
    () => visibleTechsForJobsMap(visibleJobs, techs, liveOnly),
    [visibleJobs, techs, liveOnly]
  );
  const selectedJob = selection?.kind === 'job' ? jobs.find((job) => job.id === selection.id) || null : null;
  const selectedTech = selection?.kind === 'tech' ? techs.find((tech) => tech.id === selection.id) || null : null;
  const nearby = selectedJob
    ? nearestTechsForJob(selectedJob, visibleTechs).filter((tech) => tech.isAssigned || tech.distance_m <= 40_000)
    : [];
  const techJobs = selectedTech ? jobsForTechnician(jobs, selectedTech.id) : [];
  const followupCount = jobs.filter((job) => isJobsMapFollowUpStatus(job.status)).length;
  const ongoingCount = jobs.length - followupCount;
  const unassignedCount = jobs.filter((job) => job.status === 'PENDING' || !job.assigned_technician_id).length;
  const liveCount = techs.filter((tech) => tech.source === 'live' && isJobsMapFixFresh(tech.updatedAt)).length;

  const initialJobsRef = useRef(initialJobs);
  initialJobsRef.current = initialJobs;
  const initialFollowUpJobsRef = useRef(initialFollowUpJobs);
  initialFollowUpJobsRef.current = initialFollowUpJobs;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const cached = parseJobsMapJobs([
        ...(initialJobsRef.current || []),
        ...(initialFollowUpJobsRef.current || []),
      ]);
      if (cached.jobs.length) {
        setJobs(cached.jobs);
        setMissingPins(cached.missing);
      }
      const [live, fetched, lastPins] = await Promise.all([
        fetchJobsMapLiveRows(),
        fetchOngoingJobsForMap(),
        fetchJobsMapLastLocations(techniciansRef.current.map((tech) => tech.id)),
      ]);
      if (fetched.error && !fetched.jobs.length && !cached.jobs.length) toast.error(fetched.error);
      if (fetched.jobs.length || !cached.jobs.length) {
        setJobs(fetched.jobs);
        setMissingPins(fetched.missing);
      }
      setLiveRows(live);
      setLastKnown(lastPins);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    setFilter('all');
    setQuery('');
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
    const shownJobs = searchJobsMapJobs(
      filterJobsMapJobs(jobsRef.current, filterRef.current),
      queryRef.current
    );
    const shownTechs = visibleTechsForJobsMap(shownJobs, techsRef.current, liveOnlyRef.current);
    const cameraJobs = queryRef.current.trim()
      ? shownJobs
      : jobsMapCameraJobs(shownJobs, filterRef.current);
    const fitTechs = techsNearJobs(cameraJobs, shownTechs);
    const fitPoints = jobsMapFitPoints([
      ...cameraJobs.map((job) => ({ lat: job.lat, lng: job.lng })),
      ...fitTechs.map((tech) => ({ lat: tech.lat, lng: tech.lng })),
    ]);
    const sel = selectionRef.current;

    const addMarker = (
      position: { lat: number; lng: number },
      icon: google.maps.Icon,
      title: string,
      zIndex: number,
      onClick: () => void,
      opacity = 1
    ) => {
      const marker = new window.google.maps.Marker({
        map,
        position,
        icon,
        title,
        zIndex,
        opacity,
        optimized: icon.url.startsWith('http') ? false : true,
      });
      marker.addListener('click', onClick);
      overlaysRef.current.push(marker);
    };

    for (const job of shownJobs) {
      const selected = sel?.kind === 'job' && sel.id === job.id;
      addMarker(
        { lat: job.lat, lng: job.lng },
        markerIcon(jobsMapStatusColor(job.status), jobsMapStatusShort(job.status)),
        `${job.job_number || 'Job'} · ${job.customer_name}`,
        selected ? 24 : 8,
        () => setSelection({ kind: 'job', id: job.id })
      );
    }

    for (const tech of shownTechs) {
      const selected = sel?.kind === 'tech' && sel.id === tech.id;
      const fresh = isJobsMapFixFresh(tech.updatedAt);
      addMarker(
        { lat: tech.lat, lng: tech.lng },
        techMarkerIcon(tech),
        `${tech.name} · ${agoLabel(tech.updatedAt)}`,
        selected ? 26 : 12,
        () => setSelection({ kind: 'tech', id: tech.id }),
        fresh ? 1 : 0.55
      );
    }

    const fitKey = `${fitPoints.length}:${cameraJobs.length}:${filterRef.current}:${queryRef.current}:${liveOnlyRef.current}`;
    if (fitPoints.length && (forceFitRef.current || (fitKeyRef.current !== fitKey && !sel))) {
      forceFitRef.current = false;
      fitKeyRef.current = fitKey;
      try {
        applyJobsMapCamera(map, fitPoints, cameraIdleRef);
      } catch {
        /* ignore */
      }
    }
  }, [filter, query, liveOnly, visibleJobs.length]);

  paintRef.current = paint;

  useEffect(() => {
    paint();
  }, [paint, jobs, techs, selection, query, liveOnly]);

  useEffect(() => {
    writeJobsMapPref('dark', darkMap);
    writeJobsMapPref('livegps', liveOnly);
    writeJobsMapPref('traffic', trafficOn);
  }, [darkMap, liveOnly, trafficOn]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.setOptions({
      styles: darkMap ? DARK_DISPATCH_MAP_STYLES : [],
      backgroundColor: darkMap ? DARK_DISPATCH_BG : '#e8eaed',
    });
  }, [darkMap, mapReady]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !window.google?.maps?.TrafficLayer) return;
    if (!trafficRef.current) trafficRef.current = new window.google.maps.TrafficLayer();
    trafficRef.current.setMap(trafficOn && open ? map : null);
    return () => {
      if (!open) trafficRef.current?.setMap(null);
    };
  }, [trafficOn, mapReady, open]);

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
        for (const tech of nearestTechsForJob(
          job,
          visibleTechsForJobsMap(jobsRef.current, techsRef.current, liveOnlyRef.current)
        )
          .filter((row) => row.isAssigned || row.distance_m <= 40_000)
          .slice(0, MAX_JOB_ROUTES)) {
          pairs.push({
            fromId: tech.id,
            toId: job.id,
            origin: { lat: tech.lat, lng: tech.lng },
            dest: { lat: job.lat, lng: job.lng },
            color: tech.isAssigned ? '#60a5fa' : '#2dd4bf',
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
    const ends: Array<{ lat: number; lng: number }> = [];
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
      const first = route.path[0];
      const last = route.path[route.path.length - 1];
      if (first) ends.push(first);
      if (last) ends.push(last);
    }
    try {
      applyJobsMapCamera(map, jobsMapFitPoints(ends), cameraIdleRef);
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
            {ongoingCount} ongoing with pins
            {followupCount ? ` · ${followupCount} follow-up` : ''}
            {unassignedCount ? ` · ${unassignedCount} unassigned` : ''}
            {techs.length ? ` · ${techs.length} technicians` : ''}
            {liveCount ? ` · ${liveCount} live GPS` : ''}
            {missingPins ? ` · ${missingPins} jobs have no map pin` : ''}
          </DialogDescription>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col md:flex-row">
          <div className={cn('relative min-h-[220px] flex-1 overflow-hidden md:order-2', darkMap ? 'bg-[#3d4248]' : 'bg-muted')}>
            <DraggableMap
              center={BENGALURU}
              zoom={14}
              height="100%"
              hideMarker
              syncCamera={false}
              gestureHandling="greedy"
              mapTypeControl={false}
              streetViewControl={false}
              fullscreenControl={false}
              styles={DARK_DISPATCH_MAP_STYLES}
              onMapReady={(map) => {
                mapRef.current = map;
                if (mapClickRef.current) {
                  window.google?.maps.event.removeListener(mapClickRef.current);
                }
                mapClickRef.current = map.addListener('click', () => setSelection(null));
                setMapReady(true);
                forceFitRef.current = true;
                paint();
                window.setTimeout(() => {
                  forceFitRef.current = true;
                  paintRef.current();
                }, 160);
              }}
            />
            {loading ? (
              <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/40">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : null}
            <div className="absolute right-3 top-3 z-20 flex flex-col items-end gap-1.5">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="h-11 cursor-pointer gap-1.5 bg-white/90 text-foreground shadow-sm hover:bg-white"
              onClick={() => void load()}
              disabled={loading}
            >
              <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
              Refresh
            </Button>
            <div className="flex gap-1.5">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                title={trafficOn ? 'Hide traffic' : 'Show traffic'}
                className={cn(
                  'h-11 w-11 cursor-pointer bg-white/90 p-0 text-foreground shadow-sm hover:bg-white',
                  trafficOn && 'ring-2 ring-sky-500'
                )}
                onClick={() => setTrafficOn((on) => !on)}
              >
                <Car className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                title={liveOnly ? 'Showing live GPS only' : 'Showing all technician pins'}
                className={cn(
                  'h-11 w-11 cursor-pointer bg-white/90 p-0 text-foreground shadow-sm hover:bg-white',
                  liveOnly && 'ring-2 ring-teal-600'
                )}
                onClick={() => {
                  setLiveOnly((on) => !on);
                  forceFitRef.current = true;
                }}
              >
                <Radio className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                title={darkMap ? 'Light map' : 'Dark map'}
                className="h-11 w-11 cursor-pointer bg-white/90 p-0 text-foreground shadow-sm hover:bg-white"
                onClick={() => setDarkMap((on) => !on)}
              >
                {darkMap ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                title="Fit pins"
                className="h-11 w-11 cursor-pointer bg-white/90 p-0 text-foreground shadow-sm hover:bg-white"
                onClick={() => {
                  forceFitRef.current = true;
                  if (selection) setSelection(null);
                  else paint();
                }}
              >
                <LocateFixed className="h-4 w-4" />
              </Button>
            </div>
            </div>
            <div
              className={cn(
                'pointer-events-none absolute bottom-3 left-3 z-20 max-w-[min(100%,16rem)] rounded-lg px-2.5 py-2 text-[11px] leading-5 shadow-sm',
                darkMap ? 'bg-zinc-700/80 text-white/90' : 'bg-white/90 text-foreground'
              )}
            >
              <p>P unassigned · A assigned · F follow-up</p>
              <p>Photos are technicians · faded = stale GPS</p>
            </div>
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
            <div className="border-b px-3 py-2">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    fitKeyRef.current = '';
                  }}
                  placeholder="Search name, job no, or area"
                  className="h-11 pl-9"
                />
              </div>
            </div>

            {techs.length ? (
              <div className="flex gap-2 overflow-x-auto border-b px-3 py-2">
                {techs.map((tech) => {
                  const onMap = visibleTechs.some((row) => row.id === tech.id);
                  const selected = selectedTech?.id === tech.id;
                  return (
                    <button
                      key={tech.id}
                      type="button"
                      title={`${tech.name} · ${agoLabel(tech.updatedAt)}`}
                      className={cn(
                        'flex shrink-0 cursor-pointer flex-col items-center gap-1 rounded-lg px-1 py-0.5',
                        selected ? 'bg-muted' : 'hover:bg-muted/60',
                        !onMap && 'opacity-40'
                      )}
                      onClick={() => {
                        setSelection({ kind: 'tech', id: tech.id });
                        mapRef.current?.panTo({ lat: tech.lat, lng: tech.lng });
                      }}
                    >
                      <TechPhoto url={tech.photo} name={tech.name} className="h-10 w-10" />
                      <span className="max-w-[4.5rem] truncate text-[10px] text-muted-foreground">
                        {tech.name.split(' ')[0]}
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : null}

            {selectedJob ? (
              <div className="space-y-3 border-b px-3 py-3">
                <p className="text-sm font-semibold text-foreground">
                  {selectedJob.job_number || 'Job'} · {selectedJob.customer_name}
                </p>
                <p className="text-xs text-muted-foreground">
                  {jobsMapStatusLabel(selectedJob.status)}
                  {jobsMapDueLabel(selectedJob) ? ` · ${jobsMapDueLabel(selectedJob)}` : ''}
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
                          <span className="flex min-w-0 items-center gap-2">
                            <TechPhoto url={tech.photo} name={tech.name} />
                            <span className="min-w-0">
                            <span className="block truncate text-sm font-medium">
                              {tech.name}
                              {tech.isAssigned ? ' · assigned' : ''}
                            </span>
                            <span className="block text-xs text-muted-foreground">
                              {routeCaption(tech.id, selectedJob.id)} · {agoLabel(tech.updatedAt)}
                            </span>
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
                  <TechPhoto url={selectedTech.photo} name={selectedTech.name} />
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
                  No jobs with map pins
                  {query.trim() ? ' matching search' : filter !== 'all' ? ' in this filter' : ''}.
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
                            {jobsMapDueLabel(job) ? ` · ${jobsMapDueLabel(job)}` : ''}
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
