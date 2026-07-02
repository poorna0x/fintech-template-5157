import { useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';

// Global flag to track if Google Maps script is already loaded
let googleMapsScriptLoaded = false;
let googleMapsScriptLoading = false;

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

  // Load Google Maps script only when component is visible (lazy loading)
  useEffect(() => {
    // Check if already loaded globally
    if (window.google && window.google.maps) {
      googleMapsScriptLoaded = true;
      setIsScriptLoaded(true);
      return;
    }

    if (isScriptLoaded || googleMapsScriptLoaded) {
      return;
    }

    const loadGoogleMapsScript = () => {
      const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
      
      if (!apiKey) {
        toast.error('Google Maps API key not configured');
        return;
      }

      // Check if script is already loaded
      if (window.google && window.google.maps) {
        googleMapsScriptLoaded = true;
        setIsScriptLoaded(true);
        return;
      }

      // Check if script tag already exists
      const existingScript = document.querySelector('script[src*="maps.googleapis.com"]');
      if (existingScript) {
        // Script is loading, wait for it
        let checkInterval: NodeJS.Timeout | null = null;
        let timeoutId: NodeJS.Timeout | null = null;
        
        checkInterval = setInterval(() => {
          if (window.google && window.google.maps) {
            if (checkInterval) clearInterval(checkInterval);
            if (timeoutId) clearTimeout(timeoutId);
            googleMapsScriptLoaded = true;
            setIsScriptLoaded(true);
          }
        }, 100);
        
        timeoutId = setTimeout(() => {
          if (checkInterval) clearInterval(checkInterval);
          // If still not loaded after timeout, try loading again
          if (!window.google || !window.google.maps) {
            console.warn('Existing script did not load, attempting new load');
            googleMapsScriptLoading = false; // Reset flag to allow retry
            loadGoogleMapsScript();
          }
        }, 10000); // Timeout after 10s
        return;
      }

      // Prevent multiple simultaneous loads
      if (googleMapsScriptLoading) return;
      googleMapsScriptLoading = true;

      // Load the script
      const script = document.createElement('script');
      script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places&loading=async`;
      script.async = true;
      script.defer = true;
      
      script.onload = () => {
        googleMapsScriptLoaded = true;
        googleMapsScriptLoading = false;
        setIsScriptLoaded(true);
      };
      
      script.onerror = () => {
        googleMapsScriptLoading = false;
        console.error('Google Maps script failed to load');
        toast.error('Failed to load Google Maps. Please check your internet connection and refresh the page.');
        setIsScriptLoaded(false);
      };
      
      document.head.appendChild(script);
    };

    // Use Intersection Observer to load map only when visible
    let observer: IntersectionObserver | null = null;
    let timeoutId: NodeJS.Timeout | null = null;
    
    const checkAndLoad = () => {
      if (!googleMapsScriptLoaded && !googleMapsScriptLoading) {
        loadGoogleMapsScript();
      }
    };
    
    if (mapRef.current) {
      // Check if already visible immediately
      const rect = mapRef.current.getBoundingClientRect();
      const isVisible = rect.top < window.innerHeight && rect.bottom > 0 && rect.width > 0;
      
      if (isVisible) {
        // Already visible, load immediately
        checkAndLoad();
      } else {
        // Use Intersection Observer for lazy loading (if supported)
        if ('IntersectionObserver' in window) {
          observer = new IntersectionObserver(
            (entries) => {
              entries.forEach((entry) => {
                if (entry.isIntersecting && !googleMapsScriptLoaded && !googleMapsScriptLoading) {
                  checkAndLoad();
                  if (observer) {
                    observer.disconnect();
                  }
                }
              });
            },
            { threshold: 0.1, rootMargin: '50px' } // Load when 10% visible or within 50px
          );
          
          observer.observe(mapRef.current);
        }
        
        // Fallback: load after 2 seconds if still not visible (in case Intersection Observer doesn't work or not supported)
        timeoutId = setTimeout(() => {
          if (!googleMapsScriptLoaded && !googleMapsScriptLoading) {
            checkAndLoad();
          }
        }, 2000);
      }
    } else {
      // Ref not available yet, try again after a short delay
      timeoutId = setTimeout(() => {
        if (mapRef.current && !googleMapsScriptLoaded && !googleMapsScriptLoading) {
          checkAndLoad();
        }
      }, 300);
    }

    return () => {
      if (observer) {
        observer.disconnect();
      }
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [isScriptLoaded]);

  // Initialize map when script is loaded - ONLY ONCE
  useEffect(() => {
    if (!isScriptLoaded || !mapRef.current || map) {
      return;
    }

    let checkInterval: NodeJS.Timeout | null = null;
    let timeoutId: NodeJS.Timeout | null = null;
    let isMounted = true;

    // Wait for Google Maps to be fully loaded with timeout
    checkInterval = setInterval(() => {
      if (window.google && window.google.maps && window.google.maps.Map) {
        if (checkInterval) clearInterval(checkInterval);
        if (timeoutId) clearTimeout(timeoutId);
        
        if (!isMounted || !mapRef.current) return;

        try {
          // Initialize map
          const mapInstance = new window.google.maps.Map(mapRef.current, {
            center,
            zoom,
            mapTypeControl: true,
            streetViewControl: true,
            fullscreenControl: true,
          });

          if (!isMounted) {
            // Component unmounted, don't set state
            return;
          }

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
        } catch (error) {
          console.error('Error initializing Google Maps:', error);
          toast.error('Failed to initialize map. Please refresh the page.');
          if (isMounted) {
            setIsMapLoaded(false);
          }
        }
      }
    }, 100);

    // Timeout after 15 seconds
    timeoutId = setTimeout(() => {
      if (checkInterval) clearInterval(checkInterval);
      if (!isMounted) return;
      
      if (!window.google || !window.google.maps || !window.google.maps.Map) {
        console.error('Google Maps API failed to load within timeout');
        toast.error('Map loading timed out. Please check your internet connection and refresh.');
        setIsMapLoaded(false);
      }
    }, 15000);

    return () => {
      isMounted = false;
      if (checkInterval) clearInterval(checkInterval);
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [isScriptLoaded, center, zoom, onLocationChange]); // Include dependencies

  // Update marker position when center changes
  useEffect(() => {
    if (marker && map) {
      marker.setPosition(center);
      map.setCenter(center);
    }
  }, [center.lat, center.lng, marker, map]);

  // Separate effect for zoom to ensure it always updates
  useEffect(() => {
    if (map) {
      map.setZoom(zoom);
    }
  }, [zoom, map]);

  return (
    <div className="relative w-full rounded-lg overflow-hidden border-2 border-gray-300 shadow-lg">
      <div 
        ref={mapRef} 
        style={{ 
          height, 
          width: '100%',
          position: 'relative'
        }}
      />
      {!isMapLoaded && (
        <div 
          className="absolute inset-0 flex items-center justify-center bg-gray-100 z-10"
          style={{ height }}
        >
          <div className="flex flex-col items-center gap-2">
            <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
            <p className="text-sm text-gray-600">Loading map...</p>
            {!isScriptLoaded && (
              <p className="text-xs text-gray-500 mt-1">Initializing Google Maps...</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default DraggableMap;

