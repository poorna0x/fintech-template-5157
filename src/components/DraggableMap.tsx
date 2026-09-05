import { useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { ensureGoogleMapsApi } from '@/lib/googleMapsLink';

declare global {
  interface Window {
    google: typeof google;
    initMap: () => void;
  }
}

interface DraggableMapProps {
  center: { lat: number; lng: number };
  onLocationChange?: (location: { lat: number; lng: number }) => void;
  zoom?: number;
  height?: string;
  mapTypeControl?: boolean;
  streetViewControl?: boolean;
  fullscreenControl?: boolean;
  zoomControl?: boolean;
  /** Increment to pan/zoom to `center` even if lat/lng did not change. */
  cameraNonce?: number;
  /** Device GPS — shown as a blue “you are here” dot, separate from the draggable pin. */
  myLocation?: { lat: number; lng: number; accuracyMeters?: number } | null;
  /** Urban Company-style: pin stays in the center, user pans the map. Booking picker only. */
  centerPin?: boolean;
  onMapReady?: (map: google.maps.Map | null) => void;
  /** Center-pin mode: fired when the user starts panning, before the map settles. */
  onMoveStart?: () => void;
}

function MapCenterPin({ lifting }: { lifting: boolean }) {
  return (
    <div
      className="pointer-events-none absolute left-1/2 top-1/2 z-10 flex flex-col items-center"
      style={{ transform: 'translate(-50%, calc(-100% + 3px))' }}
    >
      <div
        className={`flex flex-col items-center motion-reduce:translate-y-0 motion-reduce:transition-none ${
          lifting ? '-translate-y-2' : 'translate-y-0'
        }`}
        style={{ transition: 'transform 180ms ease-out' }}
      >
        <svg
          width="40"
          height="54"
          viewBox="0 0 40 54"
          fill="none"
          aria-hidden="true"
          className="drop-shadow-[0_3px_6px_rgba(226,60,82,0.45)]"
        >
          <ellipse cx="20" cy="51.5" rx="6" ry="2.2" fill="rgba(0,0,0,0.28)" />
          <path d="M20 30v19" stroke="#E23C52" strokeWidth="2.4" strokeLinecap="round" />
          <circle cx="20" cy="16" r="15" fill="#E23C52" />
          <circle cx="20" cy="16" r="8.2" fill="white" />
          <circle cx="20" cy="16" r="4.4" fill="#E23C52" />
        </svg>
      </div>
    </div>
  );
}

const DraggableMap = ({
  center,
  onLocationChange,
  zoom = 15,
  height = '400px',
  mapTypeControl = true,
  streetViewControl = true,
  fullscreenControl = true,
  zoomControl = true,
  cameraNonce = 0,
  myLocation = null,
  centerPin = false,
  onMapReady,
  onMoveStart,
}: DraggableMapProps) => {
  const mapElRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const markerRef = useRef<google.maps.Marker | null>(null);
  const myDotRef = useRef<google.maps.Marker | null>(null);
  const myCircleRef = useRef<google.maps.Circle | null>(null);
  const onChangeRef = useRef(onLocationChange);
  const centerRef = useRef(center);
  const zoomRef = useRef(zoom);
  const myLocationRef = useRef(myLocation);
  const centerPinRef = useRef(centerPin);
  const onMapReadyRef = useRef(onMapReady);
  const onMoveStartRef = useRef(onMoveStart);
  const liftingRef = useRef(false);
  const [isMapLoaded, setIsMapLoaded] = useState(false);
  const [lifting, setLifting] = useState(false);

  onChangeRef.current = onLocationChange;
  centerRef.current = center;
  zoomRef.current = zoom;
  myLocationRef.current = myLocation;
  centerPinRef.current = centerPin;
  onMapReadyRef.current = onMapReady;
  onMoveStartRef.current = onMoveStart;

  const paintMyLocation = (map: google.maps.Map, loc: DraggableMapProps['myLocation']) => {
    if (!loc) {
      myDotRef.current?.setMap(null);
      myCircleRef.current?.setMap(null);
      myDotRef.current = null;
      myCircleRef.current = null;
      return;
    }
    const pos = { lat: loc.lat, lng: loc.lng };
    const radius = Math.min(Math.max(loc.accuracyMeters || 24, 18), 90);
    if (!myCircleRef.current) {
      myCircleRef.current = new google.maps.Circle({
        map,
        center: pos,
        radius,
        fillColor: '#4285F4',
        fillOpacity: 0.16,
        strokeColor: '#4285F4',
        strokeOpacity: 0.35,
        strokeWeight: 1,
        clickable: false,
        zIndex: 1,
      });
    } else {
      myCircleRef.current.setCenter(pos);
      myCircleRef.current.setRadius(radius);
      myCircleRef.current.setMap(map);
    }
    if (!myDotRef.current) {
      myDotRef.current = new google.maps.Marker({
        map,
        position: pos,
        clickable: false,
        zIndex: 2,
        title: 'Your location',
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 8,
          fillColor: '#4285F4',
          fillOpacity: 1,
          strokeColor: '#ffffff',
          strokeWeight: 2.5,
        },
      });
    } else {
      myDotRef.current.setPosition(pos);
      myDotRef.current.setMap(map);
    }
  };

  useEffect(() => {
    let cancelled = false;
    let resizeObserver: ResizeObserver | null = null;
    let sizePoll: number | null = null;
    let dragListener: google.maps.MapsEventListener | null = null;
    let dragStartListener: google.maps.MapsEventListener | null = null;
    let idleListener: google.maps.MapsEventListener | null = null;
    let idleTimer: number | null = null;
    let coastTimer: number | null = null;

    const clearNode = () => {
      if (mapElRef.current) {
        mapElRef.current.replaceChildren();
      }
    };

    const tryCreate = (): boolean => {
      if (cancelled || mapRef.current || !mapElRef.current) return Boolean(mapRef.current);
      if (!window.google?.maps?.Map) return false;
      const el = mapElRef.current;
      if (el.clientWidth < 8 || el.clientHeight < 8) return false;

      const mapInstance = new window.google.maps.Map(el, {
        center: centerRef.current,
        zoom: zoomRef.current,
        mapTypeControl,
        streetViewControl,
        fullscreenControl,
        zoomControl,
        gestureHandling: centerPinRef.current ? 'cooperative' : 'greedy',
        clickableIcons: !centerPinRef.current,
        keyboardShortcuts: false,
      });

      if (centerPinRef.current) {
        let userPanned = false;
        const emitCenter = () => {
          const next = mapInstance.getCenter();
          if (!next) return;
          onChangeRef.current?.({ lat: next.lat(), lng: next.lng() });
        };
        dragStartListener = mapInstance.addListener('drag', () => {
          userPanned = true;
          if (liftingRef.current) return;
          liftingRef.current = true;
          setLifting(true);
          onMoveStartRef.current?.();
        });
        dragListener = mapInstance.addListener('dragend', () => {
          liftingRef.current = false;
          setLifting(false);
          // Mobile maps often keep coasting after finger-up; catch the settled center.
          if (coastTimer != null) window.clearTimeout(coastTimer);
          coastTimer = window.setTimeout(() => {
            coastTimer = null;
            emitCenter();
          }, 420);
        });
        idleListener = mapInstance.addListener('idle', () => {
          if (!userPanned) return;
          userPanned = false;
          if (idleTimer != null) window.clearTimeout(idleTimer);
          idleTimer = window.setTimeout(() => {
            idleTimer = null;
            emitCenter();
          }, 50);
        });
      } else {
        const markerInstance = new window.google.maps.Marker({
          position: centerRef.current,
          map: mapInstance,
          draggable: true,
          title: 'Drag to select location',
          zIndex: 10,
        });
        dragListener = markerInstance.addListener('dragend', () => {
          const position = markerInstance.getPosition();
          if (position) {
            onChangeRef.current?.({
              lat: position.lat(),
              lng: position.lng(),
            });
          }
        });
        markerRef.current = markerInstance;
      }
      mapRef.current = mapInstance;
      paintMyLocation(mapInstance, myLocationRef.current);
      setIsMapLoaded(true);
      onMapReadyRef.current?.(mapInstance);
      window.setTimeout(() => {
        if (cancelled || !mapRef.current) return;
        try {
          google.maps.event.trigger(mapRef.current, 'resize');
        } catch {
          /* ignore */
        }
        mapRef.current.setCenter(centerRef.current);
      }, 80);
      return true;
    };

    const watchSize = () => {
      if (tryCreate()) return;
      if (mapElRef.current && typeof ResizeObserver !== 'undefined') {
        resizeObserver = new ResizeObserver(() => {
          if (tryCreate()) {
            resizeObserver?.disconnect();
            resizeObserver = null;
          }
        });
        resizeObserver.observe(mapElRef.current);
      }
      sizePoll = window.setInterval(() => {
        if (tryCreate() || cancelled) {
          if (sizePoll != null) window.clearInterval(sizePoll);
          sizePoll = null;
          resizeObserver?.disconnect();
          resizeObserver = null;
        }
      }, 80);
    };

    const init = async () => {
      try {
        await ensureGoogleMapsApi();
      } catch {
        if (!cancelled) {
          toast.error('Failed to load Google Maps. Please check your internet connection and refresh.');
        }
        return;
      }
      if (cancelled) return;
      watchSize();
    };

    void init();

    return () => {
      cancelled = true;
      resizeObserver?.disconnect();
      if (sizePoll != null) window.clearInterval(sizePoll);
      if (dragStartListener) {
        try {
          google.maps.event.removeListener(dragStartListener);
        } catch {
          /* ignore */
        }
      }
      if (dragListener) {
        try {
          google.maps.event.removeListener(dragListener);
        } catch {
          /* ignore */
        }
      }
      if (idleListener) {
        try {
          google.maps.event.removeListener(idleListener);
        } catch {
          /* ignore */
        }
      }
      if (idleTimer != null) window.clearTimeout(idleTimer);
      if (coastTimer != null) window.clearTimeout(coastTimer);
      markerRef.current?.setMap(null);
      markerRef.current = null;
      myDotRef.current?.setMap(null);
      myDotRef.current = null;
      myCircleRef.current?.setMap(null);
      myCircleRef.current = null;
      onMapReadyRef.current?.(null);
      mapRef.current = null;
      clearNode();
    };
  }, []);

  useEffect(() => {
    if (!mapRef.current) return;
    if (markerRef.current) markerRef.current.setPosition(center);
    mapRef.current.setCenter(center);
  }, [center.lat, center.lng]);

  useEffect(() => {
    mapRef.current?.setZoom(zoom);
  }, [zoom]);

  useEffect(() => {
    if (!cameraNonce || !mapRef.current) return;
    const next = centerRef.current;
    markerRef.current?.setPosition(next);
    mapRef.current.setZoom(zoomRef.current);
    mapRef.current.panTo(next);
  }, [cameraNonce]);

  useEffect(() => {
    if (!mapRef.current) return;
    paintMyLocation(mapRef.current, myLocation);
  }, [myLocation?.lat, myLocation?.lng, myLocation?.accuracyMeters]);

  return (
    <div
      className={`relative w-full overflow-hidden ${
        centerPin
          ? 'rounded-none border-0 shadow-none'
          : 'rounded-lg border-2 border-gray-300 shadow-lg'
      }`}
    >
      <div
        ref={mapElRef}
        style={{
          height,
          width: '100%',
          position: 'relative',
        }}
      />
      {centerPin && isMapLoaded ? <MapCenterPin lifting={lifting} /> : null}
      {!isMapLoaded && (
        <div
          className="absolute inset-0 z-10 flex items-center justify-center bg-gray-100"
          style={{ height }}
        >
          <div className="flex flex-col items-center gap-2">
            <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
            <p className="text-sm text-gray-600">Loading map...</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default DraggableMap;
