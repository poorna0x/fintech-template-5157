import { useEffect, useRef, useState } from 'react';
import { Loader2, MapPin } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import DraggableMap from '@/components/DraggableMap';
import { calculateHaversineDistance } from '@/lib/distance';
import { fetchDrivingRoute } from '@/lib/googleMapsDistance';
import { ensureGoogleMapsApi } from '@/lib/googleMapsLink';
import { getJobLocationLabelForWhatsApp } from '@/lib/customer-locations';
import { getLocationUnavailableMessage, resolveJobLatLngFromRow } from '@/lib/jobLocationHelpers';
import { db } from '@/lib/supabase';
import { isActiveTechnicianAccount } from '@/lib/technicianAccountStatus';
import { readLocationLatLng } from '@/lib/maps';
import { cn } from '@/lib/utils';
import type { Job, Technician } from '@/types';
import { toast } from 'sonner';

const BENGALURU = { lat: 12.9716, lng: 77.5946 };
const ROUTE_COLORS = ['#2563eb', '#059669', '#d97706', '#7c3aed', '#db2777', '#0891b2', '#65a30d', '#ea580c', '#4f46e5', '#be123c'];
const MAX_ROUTES = 10;

type Pin = {
  id: string;
  name: string;
  photo?: string;
  lat: number;
  lng: number;
  color: string;
  straightKm: number;
};

type RouteRow = Pin & {
  path: google.maps.LatLngLiteral[];
  durationText: string;
  durationSeconds: number;
  distanceText: string;
  loading: boolean;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  job: Job;
  technicians: Technician[];
  onSelectTechnician?: (technicianId: string) => void;
};

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const letters = `${parts[0]?.[0] || ''}${parts[1]?.[0] || ''}`;
  return (letters || '?').toUpperCase();
}

function formatKm(km: number): string {
  if (!Number.isFinite(km)) return '';
  if (km < 1) return `${Math.max(1, Math.round(km * 1000))} m`;
  return `${km.toFixed(1)} km`;
}

function letterIcon(letter: string, color: string): google.maps.Icon {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48"><circle cx="24" cy="24" r="20" fill="${color}" stroke="white" stroke-width="3"/><text x="24" y="29" text-anchor="middle" fill="white" font-size="15" font-family="system-ui,sans-serif" font-weight="700">${letter}</text></svg>`;
  return {
    url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
    scaledSize: new google.maps.Size(48, 48),
    anchor: new google.maps.Point(24, 24),
  };
}

function jobIcon(): google.maps.Icon {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="52" viewBox="0 0 40 52"><path d="M20 2C10 2 3 9.2 3 18.6 3 31 20 50 20 50s17-19 17-31.4C37 9.2 30 2 20 2z" fill="#dc2626" stroke="white" stroke-width="2"/><circle cx="20" cy="18" r="7" fill="white"/></svg>`;
  return {
    url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
    scaledSize: new google.maps.Size(36, 46),
    anchor: new google.maps.Point(18, 46),
  };
}

function etaIcon(label: string, color: string): google.maps.Icon {
  const text = label.replace(/[<>&"]/g, '');
  const width = Math.min(200, Math.max(88, 7.4 * text.length + 28));
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="28"><rect x="1" y="1" width="${width - 2}" height="26" rx="13" fill="${color}" stroke="white" stroke-width="2"/><text x="${width / 2}" y="18.5" text-anchor="middle" fill="white" font-size="12" font-family="system-ui,sans-serif" font-weight="700">${text}</text></svg>`;
  return {
    url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
    scaledSize: new google.maps.Size(width, 28),
    anchor: new google.maps.Point(width / 2, 14),
  };
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('photo'));
    img.src = url;
  });
}

async function photoIcon(url: string | undefined, letter: string, color: string): Promise<google.maps.Icon> {
  const fallback = letterIcon(letter, color);
  if (!url) return fallback;
  try {
    const img = await loadImage(url);
    const size = 48;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return fallback;
    ctx.beginPath();
    ctx.arc(24, 24, 22, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.save();
    ctx.beginPath();
    ctx.arc(24, 24, 19, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(img, 5, 5, 38, 38);
    ctx.restore();
    ctx.beginPath();
    ctx.arc(24, 24, 22, 0, Math.PI * 2);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3;
    ctx.stroke();
    return {
      url: canvas.toDataURL('image/png'),
      scaledSize: new google.maps.Size(48, 48),
      anchor: new google.maps.Point(24, 24),
    };
  } catch {
    return fallback;
  }
}

async function mapPool<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      out[index] = await fn(items[index], index);
    }
  });
  await Promise.all(workers);
  return out;
}

export default function AssignDistanceRoutesDialog({
  open,
  onOpenChange,
  job,
  technicians,
  onSelectTechnician,
}: Props) {
  const mapRef = useRef<google.maps.Map | null>(null);
  const overlaysRef = useRef<google.maps.MVCObject[]>([]);
  const [jobPoint, setJobPoint] = useState<{ lat: number; lng: number } | null>(null);
  const [rows, setRows] = useState<RouteRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [resolving, setResolving] = useState(false);
  const [placeLabel, setPlaceLabel] = useState('');
  const rowsRef = useRef(rows);
  const jobPointRef = useRef(jobPoint);
  const selectedRef = useRef(selectedId);
  const userMovedRef = useRef(false);
  const lastFitSelectedRef = useRef<string | null | undefined>(undefined);
  const jobRef = useRef(job);
  const techniciansRef = useRef(technicians);
  const onOpenChangeRef = useRef(onOpenChange);
  const onSelectRef = useRef(onSelectTechnician);
  rowsRef.current = rows;
  jobPointRef.current = jobPoint;
  selectedRef.current = selectedId;
  jobRef.current = job;
  techniciansRef.current = technicians;
  onOpenChangeRef.current = onOpenChange;
  onSelectRef.current = onSelectTechnician;

  const clearOverlays = () => {
    for (const overlay of overlaysRef.current) {
      (overlay as google.maps.Marker | google.maps.Polyline).setMap(null);
    }
    overlaysRef.current = [];
  };

  const paint = () => {
    const map = mapRef.current;
    if (!map || !window.google?.maps) return;
    clearOverlays();
    const jobPin = jobPointRef.current;
    const list = rowsRef.current;
    const selected = selectedRef.current;
    const bounds = new window.google.maps.LatLngBounds();
    let hasPoint = false;

    if (jobPin) {
      const marker = new window.google.maps.Marker({
        map,
        position: jobPin,
        icon: jobIcon(),
        title: 'Job',
        zIndex: 40,
      });
      overlaysRef.current.push(marker);
      bounds.extend(jobPin);
      hasPoint = true;
    }

    for (const row of list) {
      const active = !selected || selected === row.id;
      if (row.path.length > 1) {
        const line = new window.google.maps.Polyline({
          map,
          path: row.path,
          strokeColor: row.color,
          strokeOpacity: active ? 0.95 : 0.25,
          strokeWeight: selected === row.id ? 7 : 4,
          zIndex: selected === row.id ? 12 : 6,
        });
        overlaysRef.current.push(line);
        if (active && row.durationText) {
          const mid = row.path[Math.floor(row.path.length / 2)];
          const badge = new window.google.maps.Marker({
            map,
            position: mid,
            icon: etaIcon(row.durationText, row.color),
            title: `${row.name} · ${row.durationText}`,
            zIndex: 30,
            clickable: false,
          });
          overlaysRef.current.push(badge);
        }
      }
      const marker = new window.google.maps.Marker({
        map,
        position: { lat: row.lat, lng: row.lng },
        icon: letterIcon(initials(row.name), row.color),
        title: row.name,
        zIndex: selected === row.id ? 35 : 20,
        opacity: active ? 1 : 0.45,
      });
      marker.addListener('click', () => {
        setSelectedId(row.id);
        onSelectRef.current?.(row.id);
      });
      overlaysRef.current.push(marker);
      bounds.extend({ lat: row.lat, lng: row.lng });
      hasPoint = true;
      void photoIcon(row.photo, initials(row.name), row.color).then((icon) => {
        if (mapRef.current && overlaysRef.current.includes(marker)) marker.setIcon(icon);
      });
    }

    if (!hasPoint) return;
    const selectionChanged = lastFitSelectedRef.current !== selected;
    lastFitSelectedRef.current = selected;
    if (userMovedRef.current && !selectionChanged) return;
    const focus = selected ? list.find((row) => row.id === selected) : null;
    const focusBounds = new window.google.maps.LatLngBounds();
    if (focus && jobPin) {
      focusBounds.extend(jobPin);
      focusBounds.extend({ lat: focus.lat, lng: focus.lng });
      for (const point of focus.path) focusBounds.extend(point);
      map.fitBounds(focusBounds, { top: 48, right: 24, bottom: 36, left: 24 });
      return;
    }
    map.fitBounds(bounds, { top: 48, right: 24, bottom: 36, left: 24 });
  };

  useEffect(() => {
    if (!open) {
      setJobPoint(null);
      setRows([]);
      setSelectedId(null);
      setResolving(false);
      clearOverlays();
      return;
    }

    let cancelled = false;
    userMovedRef.current = false;
    lastFitSelectedRef.current = undefined;
    setResolving(true);
    setRows([]);
    setJobPoint(null);
    setSelectedId(null);

    const currentJob = jobRef.current;
    const customer = (currentJob.customer as { full_name?: string; fullName?: string } | undefined) || undefined;
    const label = getJobLocationLabelForWhatsApp(currentJob as never, customer);
    setPlaceLabel(label || customer?.full_name || customer?.fullName || 'This job');

    void (async () => {
      try {
        await ensureGoogleMapsApi();
        const resolved = await resolveJobLatLngFromRow(currentJob, { getJobByIdFull: db.jobs.getByIdFull });
        if (cancelled) return;
        if (!resolved) {
          toast.error(getLocationUnavailableMessage(currentJob));
          onOpenChangeRef.current(false);
          return;
        }
        const dest = { lat: resolved.lat, lng: resolved.lng };
        setJobPoint(dest);

        const pins: Pin[] = [];
        for (const tech of techniciansRef.current) {
          if (!isActiveTechnicianAccount(tech)) continue;
          const loc =
            readLocationLatLng((tech as { current_location?: unknown }).current_location) ||
            readLocationLatLng(tech.currentLocation);
          if (!loc) continue;
          pins.push({
            id: tech.id,
            name: tech.fullName || 'Technician',
            photo: tech.photo,
            lat: loc.lat,
            lng: loc.lng,
            color: '#2563eb',
            straightKm: calculateHaversineDistance(dest.lat, dest.lng, loc.lat, loc.lng),
          });
        }
        pins.sort((a, b) => a.straightKm - b.straightKm);
        const closest = pins.slice(0, MAX_ROUTES).map((pin, index) => ({
          ...pin,
          color: ROUTE_COLORS[index % ROUTE_COLORS.length],
        }));

        setRows(
          closest.map((pin) => ({
            ...pin,
            path: [
              { lat: pin.lat, lng: pin.lng },
              dest,
            ],
            durationText: '',
            durationSeconds: Number.POSITIVE_INFINITY,
            distanceText: formatKm(pin.straightKm),
            loading: true,
          }))
        );

        await mapPool(closest, 3, async (pin) => {
          const route = await fetchDrivingRoute({ lat: pin.lat, lng: pin.lng }, dest);
          if (cancelled) return;
          setRows((prev) =>
            prev.map((row) => {
              if (row.id !== pin.id) return row;
              const meters = route?.distanceMeters;
              return {
                ...row,
                path: route?.path?.length ? route.path : row.path,
                durationText: route?.durationText || '—',
                durationSeconds: route?.durationSeconds || Number.POSITIVE_INFINITY,
                distanceText: meters ? formatKm(meters / 1000) : row.distanceText,
                loading: false,
              };
            })
          );
        });
      } catch {
        if (!cancelled) toast.error('Could not load the route map');
      } finally {
        if (!cancelled) setResolving(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    paint();
  }, [rows, jobPoint, selectedId]);

  const sorted = [...rows].sort((a, b) => a.durationSeconds - b.durationSeconds || a.straightKm - b.straightKm);
  const jobNumber = (job as { job_number?: string }).job_number || job.jobNumber || '';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        overlayClassName="z-[80]"
        className="z-[80] flex h-[100dvh] max-h-[100dvh] w-screen max-w-none flex-col gap-0 overflow-hidden rounded-none p-0 sm:h-[min(92vh,780px)] sm:w-[min(96vw,760px)] sm:max-w-[760px] sm:rounded-lg"
      >
        <DialogHeader className="space-y-1 border-b px-4 py-3 pr-14 text-left">
          <DialogTitle className="text-base sm:text-lg">Routes to this job</DialogTitle>
          <DialogDescription className="text-xs sm:text-sm">
            {[jobNumber, placeLabel].filter(Boolean).join(' · ')}
          </DialogDescription>
        </DialogHeader>

        <div className="relative h-[46vh] min-h-[220px] shrink-0 sm:h-[340px]">
          <DraggableMap
            center={jobPoint || BENGALURU}
            zoom={13}
            height="100%"
            hideMarker
            syncCamera={false}
            gestureHandling="greedy"
            mapTypeControl={false}
            streetViewControl={false}
            fullscreenControl={false}
            onMapReady={(map) => {
              mapRef.current = map;
              if (!map) return;
              map.addListener('dragstart', () => {
                userMovedRef.current = true;
              });
              paint();
            }}
            onLayout={() => paint()}
          />
          {resolving ? (
            <div className="pointer-events-none absolute left-3 top-3 flex items-center gap-2 rounded-full bg-background/95 px-3 py-1.5 text-xs shadow-sm">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Loading routes
            </div>
          ) : null}
          {jobPoint ? (
            <div className="pointer-events-none absolute bottom-3 left-3 flex items-center gap-1.5 rounded-full bg-background/95 px-2.5 py-1 text-[11px] font-medium shadow-sm">
              <MapPin className="h-3.5 w-3.5 text-red-600" />
              Job
            </div>
          ) : null}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {sorted.length === 0 && !resolving ? (
            <p className="px-4 py-6 text-center text-sm text-muted-foreground">
              No technician has a current location yet.
            </p>
          ) : (
            <ul className="divide-y">
              {sorted.map((row) => {
                const active = selectedId === row.id;
                return (
                  <li key={row.id}>
                    <button
                      type="button"
                      className={cn(
                        'flex w-full items-center gap-3 px-4 py-3 text-left touch-manipulation',
                        active ? 'bg-muted/70' : 'hover:bg-muted/40'
                      )}
                      onClick={() => {
                        setSelectedId(row.id);
                        onSelectTechnician?.(row.id);
                      }}
                    >
                      {row.photo ? (
                        <img
                          src={row.photo}
                          alt=""
                          className="h-11 w-11 shrink-0 rounded-full object-cover"
                          style={{ boxShadow: `0 0 0 2px ${row.color}` }}
                        />
                      ) : (
                        <span
                          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white"
                          style={{ backgroundColor: row.color }}
                        >
                          {initials(row.name)}
                        </span>
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{row.name}</span>
                        <span className="mt-0.5 block text-xs text-muted-foreground">
                          {row.loading ? 'Calculating route…' : row.distanceText || formatKm(row.straightKm)}
                        </span>
                      </span>
                      <span className="shrink-0 text-sm font-semibold tabular-nums" style={{ color: row.color }}>
                        {row.loading ? '…' : row.durationText || '—'}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
