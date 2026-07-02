import { useEffect, useMemo, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  buildGoogleMapsEmbedUrl,
  ensureGoogleMapsMapReady,
  mapContainerShowsGoogleError,
} from '@/lib/googleMapsLink';

declare global {
  interface Window {
    google: typeof google;
    gm_authFailure?: () => void;
  }
}

interface DraggableMapProps {
  center: { lat: number; lng: number };
  onLocationChange?: (location: { lat: number; lng: number }) => void;
  zoom?: number;
  height?: string;
}

type LoadState = 'loading' | 'interactive' | 'embed' | 'error';

function triggerMapResize(map: google.maps.Map) {
  window.google.maps.event.trigger(map, 'resize');
}

function waitForMapIdle(map: google.maps.Map, timeoutMs = 20000): Promise<void> {
  return new Promise((resolve, reject) => {
    let idleListener: google.maps.MapsEventListener | null = null;
    const timeout = window.setTimeout(() => {
      if (idleListener) window.google.maps.event.removeListener(idleListener);
      reject(new Error('Google Maps timed out while loading tiles'));
    }, timeoutMs);

    idleListener = map.addListener('idle', () => {
      window.clearTimeout(timeout);
      if (idleListener) window.google.maps.event.removeListener(idleListener);
      resolve();
    });
  });
}

async function waitForHealthyMap(map: google.maps.Map, container: HTMLElement): Promise<void> {
  await waitForMapIdle(map);
  for (let attempt = 0; attempt < 8; attempt += 1) {
    if (mapContainerShowsGoogleError(container)) {
      throw new Error('Google Maps auth error');
    }
    await new Promise((resolve) => window.setTimeout(resolve, 200));
  }
}

const DraggableMap = ({ center, onLocationChange, zoom = 15, height = '400px' }: DraggableMapProps) => {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<google.maps.Map | null>(null);
  const markerRef = useRef<google.maps.Marker | null>(null);
  const onLocationChangeRef = useRef(onLocationChange);
  const centerRef = useRef(center);
  const zoomRef = useRef(zoom);
  const [loadState, setLoadState] = useState<LoadState>('loading');

  const embedUrl = useMemo(
    () => buildGoogleMapsEmbedUrl(center.lat, center.lng, zoom),
    [center.lat, center.lng, zoom]
  );

  useEffect(() => {
    onLocationChangeRef.current = onLocationChange;
  }, [onLocationChange]);

  useEffect(() => {
    centerRef.current = center;
  }, [center]);

  useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);

  useEffect(() => {
    let cancelled = false;
    let resizeObserver: ResizeObserver | null = null;
    let resizeFrame = 0;
    const resizeTimers: ReturnType<typeof setTimeout>[] = [];

    const refreshMapLayout = () => {
      const map = mapInstanceRef.current;
      if (!map) return;
      triggerMapResize(map);
      map.setCenter(centerRef.current);
      map.setZoom(zoomRef.current);
    };

    const scheduleResize = () => {
      resizeTimers.push(window.setTimeout(refreshMapLayout, 0));
      resizeTimers.push(window.setTimeout(refreshMapLayout, 400));
    };

    const initMap = async () => {
      if (!mapRef.current) return;

      try {
        await ensureGoogleMapsMapReady();
        if (cancelled || !mapRef.current) return;

        const mapInstance = new window.google.maps.Map(mapRef.current, {
          center: centerRef.current,
          zoom: zoomRef.current,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: true,
        });

        const markerInstance = new window.google.maps.Marker({
          position: centerRef.current,
          map: mapInstance,
          draggable: true,
          title: 'Drag to select location',
        });

        markerInstance.addListener('dragend', () => {
          const position = markerInstance.getPosition();
          if (position && onLocationChangeRef.current) {
            onLocationChangeRef.current({
              lat: position.lat(),
              lng: position.lng(),
            });
          }
        });

        mapInstanceRef.current = mapInstance;
        markerRef.current = markerInstance;
        scheduleResize();

        await waitForHealthyMap(mapInstance, mapRef.current);
        if (cancelled) return;

        if (typeof ResizeObserver !== 'undefined' && mapRef.current) {
          resizeObserver = new ResizeObserver(() => {
            if (resizeFrame) window.cancelAnimationFrame(resizeFrame);
            resizeFrame = window.requestAnimationFrame(refreshMapLayout);
          });
          resizeObserver.observe(mapRef.current);
        }

        if (!cancelled) {
          setLoadState('interactive');
        }
      } catch (error) {
        console.error('Error loading Google Maps:', error);
        if (!cancelled) {
          setLoadState('embed');
          toast.message('Showing basic map view — drag pin unavailable on this device.', {
            duration: 4000,
          });
        }
      }
    };

    void initMap();

    return () => {
      cancelled = true;
      if (resizeFrame) window.cancelAnimationFrame(resizeFrame);
      resizeTimers.forEach((timer) => window.clearTimeout(timer));
      resizeObserver?.disconnect();
      markerRef.current = null;
      mapInstanceRef.current = null;
    };
  }, []);

  useEffect(() => {
    const marker = markerRef.current;
    const map = mapInstanceRef.current;
    if (!marker || !map || loadState !== 'interactive') return;

    marker.setPosition(center);
    map.panTo(center);
  }, [center.lat, center.lng, loadState]);

  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || loadState !== 'interactive') return;
    map.setZoom(zoom);
  }, [zoom, loadState]);

  return (
    <div className="relative w-full rounded-lg overflow-hidden border-2 border-gray-300 shadow-lg">
      {loadState === 'embed' ? (
        <iframe
          title="Customer location map"
          src={embedUrl}
          style={{ height, width: '100%', minHeight: height, border: 0 }}
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
          allowFullScreen
        />
      ) : (
        <div
          ref={mapRef}
          style={{
            height,
            width: '100%',
            minHeight: height,
            position: 'relative',
          }}
        />
      )}

      {loadState === 'loading' && (
        <div
          className="absolute inset-0 flex items-center justify-center bg-gray-100 z-10"
          style={{ height }}
        >
          <div className="flex flex-col items-center gap-2 px-4 text-center">
            <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
            <p className="text-sm text-gray-600">Loading map...</p>
          </div>
        </div>
      )}

      {loadState === 'error' && (
        <div
          className="absolute inset-0 flex items-center justify-center bg-gray-100 z-10 px-4 text-center"
          style={{ height }}
        >
          <p className="text-sm text-gray-600">
            Map could not load. Use GPS or enter the address manually.
          </p>
        </div>
      )}
    </div>
  );
};

export default DraggableMap;
