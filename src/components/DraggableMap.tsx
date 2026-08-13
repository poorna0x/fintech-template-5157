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
}

const DraggableMap = ({ center, onLocationChange, zoom = 15, height = '400px' }: DraggableMapProps) => {
  const mapElRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const markerRef = useRef<google.maps.Marker | null>(null);
  const onChangeRef = useRef(onLocationChange);
  const centerRef = useRef(center);
  const zoomRef = useRef(zoom);
  const [isMapLoaded, setIsMapLoaded] = useState(false);

  onChangeRef.current = onLocationChange;
  centerRef.current = center;
  zoomRef.current = zoom;

  useEffect(() => {
    let cancelled = false;
    let resizeObserver: ResizeObserver | null = null;
    let sizePoll: number | null = null;
    let dragListener: google.maps.MapsEventListener | null = null;

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
        mapTypeControl: true,
        streetViewControl: true,
        fullscreenControl: true,
        gestureHandling: 'greedy',
      });
      const markerInstance = new window.google.maps.Marker({
        position: centerRef.current,
        map: mapInstance,
        draggable: true,
        title: 'Drag to select location',
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
      mapRef.current = mapInstance;
      markerRef.current = markerInstance;
      setIsMapLoaded(true);
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
      if (dragListener) {
        try {
          google.maps.event.removeListener(dragListener);
        } catch {
          /* ignore */
        }
      }
      markerRef.current?.setMap(null);
      markerRef.current = null;
      mapRef.current = null;
      clearNode();
    };
  }, []);

  useEffect(() => {
    if (!mapRef.current || !markerRef.current) return;
    markerRef.current.setPosition(center);
    mapRef.current.setCenter(center);
  }, [center.lat, center.lng]);

  useEffect(() => {
    mapRef.current?.setZoom(zoom);
  }, [zoom]);

  return (
    <div className="relative w-full overflow-hidden rounded-lg border-2 border-gray-300 shadow-lg">
      <div
        ref={mapElRef}
        style={{
          height,
          width: '100%',
          position: 'relative',
        }}
      />
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
