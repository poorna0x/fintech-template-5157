import { useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Loader } from '@googlemaps/js-api-loader';

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
  const mapRef = useRef<HTMLDivElement>(null);
  const [isMapLoaded, setIsMapLoaded] = useState(false);
  const [isScriptLoaded, setIsScriptLoaded] = useState(false);
  const [map, setMap] = useState<google.maps.Map | null>(null);
  const [marker, setMarker] = useState<google.maps.Marker | null>(null);

  // Load Google Maps script using Loader
  useEffect(() => {
    if (isScriptLoaded) return;

    const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
    
    if (!apiKey) {
      toast.error('Google Maps API key not configured');
      return;
    }

    // Check if script is already loaded
    if (window.google && window.google.maps) {
      setIsScriptLoaded(true);
      return;
    }

    // Load using Loader from @googlemaps/js-api-loader
    const loader = new Loader({
      apiKey,
      version: 'weekly',
      libraries: ['places']
    });

    loader.load().then(() => {
      setIsScriptLoaded(true);
    }).catch((error) => {
      console.error('Failed to load Google Maps:', error);
      toast.error('Failed to load Google Maps');
    });
  }, [isScriptLoaded]);

  // Initialize map when script is loaded - ONLY ONCE
  useEffect(() => {
    if (!isScriptLoaded || !mapRef.current || map) {
      return;
    }

    // Wait for Google Maps to be fully loaded
    const checkGoogle = setInterval(() => {
      if (window.google && window.google.maps && window.google.maps.Map) {
        clearInterval(checkGoogle);
        
        // Initialize map
        const mapInstance = new window.google.maps.Map(mapRef.current!, {
          center,
          zoom,
          mapTypeControl: true,
          streetViewControl: true,
          fullscreenControl: true,
        });

        setMap(mapInstance);
        setIsMapLoaded(true);

        // Create draggable marker
        const markerInstance = new window.google.maps.Marker({
          position: center,
          map: mapInstance,
          draggable: true,
          title: 'Drag to select location',
        });

        setMarker(markerInstance);

        // Listen to marker drag events
        markerInstance.addListener('dragend', () => {
          const position = markerInstance.getPosition();
          if (position && onLocationChange) {
            onLocationChange({
              lat: position.lat(),
              lng: position.lng(),
            });
          }
        });
      }
    }, 100);

    return () => {
      clearInterval(checkGoogle);
    };
  }, [isScriptLoaded]); // Only depend on isScriptLoaded

  // Update marker position when center changes
  useEffect(() => {
    if (marker && map) {
      marker.setPosition(center);
      map.setCenter(center);
    }
  }, [center.lat, center.lng, marker, map]);

  return (
    <div className="relative w-full rounded-lg overflow-hidden border-2 border-gray-300 shadow-lg">
      {!isMapLoaded && (
        <div 
          className="flex items-center justify-center bg-gray-100"
          style={{ height }}
        >
          <div className="flex flex-col items-center gap-2">
            <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
            <p className="text-sm text-gray-600">Loading map...</p>
          </div>
        </div>
      )}
      <div 
        ref={mapRef} 
        style={{ 
          height, 
          width: '100%',
          display: isMapLoaded ? 'block' : 'none' 
        }}
      />
    </div>
  );
};

export default DraggableMap;

