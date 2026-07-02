import { useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { ensureGoogleMapsMapReady } from '@/lib/googleMapsLink';

declare global {
  interface Window {
    google: typeof google;
    initMap: () => void;
    gm_authFailure?: () => void;
  }
}

interface DraggableMapProps {
  center: { lat: number; lng: number };
  onLocationChange?: (location: { lat: number; lng: number }) => void;
  zoom?: number;
  height?: string;
}

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

const DraggableMap = ({ center, onLocationChange, zoom = 15, height = '400px' }: DraggableMapProps) => {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<google.maps.Map | null>(null);
  const markerRef = useRef<google.maps.Marker | null>(null);
  const onLocationChangeRef = useRef(onLocationChange);
  const centerRef = useRef(center);
  const zoomRef = useRef(zoom);
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading');

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
    const resizeTimers: ReturnType<typeof setTimeout>[] = [];

    const refreshMapLayout = () => {
      const map = mapInstanceRef.current;
      if (!map) return;
      triggerMapResize(map);
      map.setCenter(centerRef.current);
      map.setZoom(zoomRef.current);
    };

    const scheduleResize = () => {
      resizeTimers.push(setTimeout(refreshMapLayout, 0));
      resizeTimers.push(setTimeout(refreshMapLayout, 300));
    };

    const initMap = async () => {
      if (!mapRef.current) return;

      try {
        await ensureGoogleMapsMapReady();
        if (cancelled || !mapRef.current) return;

        const mapInstance = new window.google.maps.Map(mapRef.current, {
          center: centerRef.current,
          zoom: zoomRef.current,
          mapTypeControl: true,
          streetViewControl: true,
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

        await waitForMapIdle(mapInstance);
        if (cancelled) return;

        if (typeof ResizeObserver !== 'undefined' && mapRef.current) {
          resizeObserver = new ResizeObserver(() => {
            refreshMapLayout();
          });
          resizeObserver.observe(mapRef.current);
        }

        if (!cancelled) {
          setLoadState('ready');
        }
      } catch (error) {
        console.error('Error loading Google Maps:', error);
        if (!cancelled) {
          setLoadState('error');
          const message =
            error instanceof Error ? error.message : 'Failed to load Google Maps';
          toast.error(message.includes('authorized') ? message : 'Map could not load. Check connection and try again.');
        }
      }
    };

    void initMap();

    return () => {
      cancelled = true;
      resizeTimers.forEach((timer) => clearTimeout(timer));
      resizeObserver?.disconnect();
      markerRef.current = null;
      mapInstanceRef.current = null;
    };
  }, []);

  useEffect(() => {
    const marker = markerRef.current;
    const map = mapInstanceRef.current;
    if (!marker || !map) return;

    marker.setPosition(center);
    map.setCenter(center);
    triggerMapResize(map);
  }, [center.lat, center.lng]);

  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;
    map.setZoom(zoom);
  }, [zoom]);

  return (
    <div className="relative w-full rounded-lg overflow-hidden border-2 border-gray-300 shadow-lg">
      <div
        ref={mapRef}
        style={{
          height,
          width: '100%',
          minHeight: height,
          position: 'relative',
        }}
      />
      {loadState !== 'ready' && (
        <div
          className="absolute inset-0 flex items-center justify-center bg-gray-100 z-10"
          style={{ height }}
        >
          <div className="flex flex-col items-center gap-2 px-4 text-center">
            {loadState === 'loading' ? (
              <>
                <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
                <p className="text-sm text-gray-600">Loading map...</p>
              </>
            ) : (
              <p className="text-sm text-gray-600">
                Map could not load. If this keeps happening, ask admin to verify the Google Maps API key
                and referrer settings for this site.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default DraggableMap;
