import { useEffect, useRef } from 'react';
import DraggableMap from '@/components/DraggableMap';
import { jobsMapReachLabel, jobsMapSuggestedZoom } from '@/lib/adminJobsMap';

const BENGALURU = { lat: 12.9716, lng: 77.5946 };

export type VisitOrderMapStop = {
  id: string;
  lat: number;
  lng: number;
  index: number;
  title: string;
};

export type VisitOrderMapLeg = {
  path: google.maps.LatLngLiteral[];
  durationText: string;
  durationSeconds: number;
  color: string;
  reachAt?: string;
};

type Props = {
  tech: { lat: number; lng: number; name: string } | null;
  stops: VisitOrderMapStop[];
  legs: VisitOrderMapLeg[];
};

function stopIcon(index: number, first: boolean): google.maps.Icon {
  const fill = first ? '#dc2626' : '#0369a1';
  const label = String(index + 1);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 36 36"><circle cx="18" cy="18" r="14" fill="${fill}" stroke="white" stroke-width="3"/><text x="18" y="22.5" text-anchor="middle" fill="white" font-size="12" font-family="system-ui,sans-serif" font-weight="700">${label}</text></svg>`;
  return {
    url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
    scaledSize: new google.maps.Size(36, 36),
    anchor: new google.maps.Point(18, 18),
  };
}

function techIcon(): google.maps.Icon {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 36 36"><rect x="4" y="4" width="28" height="28" rx="7" fill="#0f766e" stroke="white" stroke-width="3"/><text x="18" y="22.5" text-anchor="middle" fill="white" font-size="11" font-family="system-ui,sans-serif" font-weight="700">T</text></svg>`;
  return {
    url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
    scaledSize: new google.maps.Size(36, 36),
    anchor: new google.maps.Point(18, 18),
  };
}

function etaIcon(label: string): google.maps.Icon {
  const text = label.replace(/[<>&]/g, '');
  const width = Math.min(220, Math.max(96, 7.2 * text.length + 28));
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="32"><rect x="1" y="1" width="${width - 2}" height="30" rx="15" fill="#111827" stroke="white" stroke-width="2"/><text x="${width / 2}" y="21" text-anchor="middle" fill="white" font-size="12" font-family="system-ui,sans-serif" font-weight="700">${text}</text></svg>`;
  return {
    url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
    scaledSize: new google.maps.Size(width, 32),
    anchor: new google.maps.Point(width / 2, 16),
  };
}

export default function VisitOrderPlanMap({ tech, stops, legs }: Props) {
  const mapRef = useRef<google.maps.Map | null>(null);
  const overlaysRef = useRef<google.maps.MVCObject[]>([]);
  const lastFitKeyRef = useRef('');
  const techRef = useRef(tech);
  const stopsRef = useRef(stops);
  const legsRef = useRef(legs);
  techRef.current = tech;
  stopsRef.current = stops;
  legsRef.current = legs;

  const clear = () => {
    for (const overlay of overlaysRef.current) {
      (overlay as google.maps.Marker | google.maps.Polyline).setMap(null);
    }
    overlaysRef.current = [];
  };

  const paint = () => {
    const map = mapRef.current;
    if (!map || !window.google?.maps) return;
    clear();
    const bounds = new window.google.maps.LatLngBounds();
    let hasPoint = false;

    const add = (position: { lat: number; lng: number }, icon: google.maps.Icon, title: string, zIndex: number) => {
      const marker = new window.google.maps.Marker({ map, position, icon, title, zIndex, clickable: false });
      overlaysRef.current.push(marker);
      bounds.extend(position);
      hasPoint = true;
    };

    if (techRef.current) {
      add(
        { lat: techRef.current.lat, lng: techRef.current.lng },
        techIcon(),
        techRef.current.name,
        20
      );
    }
    for (const stop of stopsRef.current) {
      add({ lat: stop.lat, lng: stop.lng }, stopIcon(stop.index, stop.index === 0), stop.title, 12 + stop.index);
    }
    for (const leg of legsRef.current) {
      if (!leg.path.length) continue;
      const line = new window.google.maps.Polyline({
        map,
        path: leg.path,
        strokeColor: leg.color,
        strokeOpacity: 0.95,
        strokeWeight: 5,
        zIndex: 7,
      });
      overlaysRef.current.push(line);
      const label = leg.reachAt
        ? `${leg.durationText} · ${leg.reachAt}`
        : jobsMapReachLabel(leg.durationText, leg.durationSeconds);
      if (label) {
        const mid = leg.path[Math.floor(leg.path.length / 2)];
        const badge = new window.google.maps.Marker({
          map,
          position: mid,
          icon: etaIcon(label),
          title: label,
          zIndex: 28,
          clickable: false,
        });
        overlaysRef.current.push(badge);
      }
    }

    if (!hasPoint) return;
    const fitKey = [
      techRef.current ? `${techRef.current.lat.toFixed(5)},${techRef.current.lng.toFixed(5)}` : 'none',
      ...stopsRef.current.map((stop) => `${stop.id}:${stop.lat.toFixed(5)},${stop.lng.toFixed(5)}`),
    ].join('|');
    if (fitKey === lastFitKeyRef.current) return;
    lastFitKeyRef.current = fitKey;
    const points = [
      ...(techRef.current ? [{ lat: techRef.current.lat, lng: techRef.current.lng }] : []),
      ...stopsRef.current.map((stop) => ({ lat: stop.lat, lng: stop.lng })),
    ];
    const wanted = jobsMapSuggestedZoom(points);
    if (points.length === 1) {
      map.setCenter(points[0]);
      map.setZoom(wanted);
      return;
    }
    try {
      map.fitBounds(bounds, { top: 48, right: 36, bottom: 36, left: 12 });
      window.google.maps.event.addListenerOnce(map, 'idle', () => {
        const zoom = map.getZoom();
        if (zoom != null && zoom < wanted) map.setZoom(wanted);
        else if (zoom != null && zoom > 16) map.setZoom(16);
      });
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    paint();
    return () => clear();
  }, [tech, stops, legs]);

  return (
    <div className="relative min-h-[220px] h-full w-full overflow-hidden bg-muted">
      <DraggableMap
        center={BENGALURU}
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
          if (map) paint();
        }}
      />
    </div>
  );
}
