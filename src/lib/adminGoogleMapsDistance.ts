import type { Dispatch, SetStateAction } from 'react';
import { toast } from 'sonner';

export type CustomerDistanceState = Record<
  string,
  {
    distance?: string;
    duration?: string;
    isCalculating?: boolean;
    mode?: string;
  }
>;

// Helper function to ensure Google Maps is loaded
export function ensureGoogleMapsLoaded(): Promise<void> {
  return new Promise((resolve, reject) => {
    // Check if already loaded
    if ((window as any).google && (window as any).google.maps && (window as any).google.maps.DistanceMatrixService) {
      resolve();
      return;
    }

    const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
    if (!apiKey) {
      reject(new Error('Google Maps API key not configured'));
      return;
    }

    // Check if script is already being loaded
    const existingScript = document.querySelector('script[src*="maps.googleapis.com"]');
    if (existingScript) {
      // Wait for it to load
      const checkInterval = setInterval(() => {
        if ((window as any).google && (window as any).google.maps && (window as any).google.maps.DistanceMatrixService) {
          clearInterval(checkInterval);
          resolve();
        }
      }, 100);

      // Timeout after 10 seconds
      setTimeout(() => {
        clearInterval(checkInterval);
        if ((window as any).google && (window as any).google.maps && (window as any).google.maps.DistanceMatrixService) {
          resolve();
        } else {
          reject(new Error('Google Maps failed to load'));
        }
      }, 10000);
      return;
    }

    // Load the script
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places&loading=async`;
    script.async = true;
    script.defer = true;
    
    script.onload = () => {
      console.log('Google Maps script loaded, waiting for DistanceMatrixService...');
      // Wait a bit for DistanceMatrixService to be available
      let attempts = 0;
      const maxAttempts = 50; // 5 seconds max
      const checkInterval = setInterval(() => {
        attempts++;
        if ((window as any).google && (window as any).google.maps && (window as any).google.maps.DistanceMatrixService) {
          console.log('DistanceMatrixService is now available');
          clearInterval(checkInterval);
          resolve();
        } else if (attempts >= maxAttempts) {
          console.error('DistanceMatrixService not available after waiting');
          clearInterval(checkInterval);
          reject(new Error('DistanceMatrixService not available after loading'));
        }
      }, 100);
    };
    
    script.onerror = () => {
      reject(new Error('Failed to load Google Maps'));
    };
    
    document.head.appendChild(script);
  });
}

export function haversineDistanceMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const R = 6371000; // meters
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const s1 = Math.sin(dLat / 2);
  const s2 = Math.sin(dLng / 2);
  const h = s1 * s1 + Math.cos(lat1) * Math.cos(lat2) * s2 * s2;
  const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  return R * c;
}

export function formatDistanceKm(meters: number): string {
  if (!Number.isFinite(meters) || meters <= 0) return '';
  const km = meters / 1000;
  if (km < 1) return `${km.toFixed(2)} km`;
  if (km < 10) return `${km.toFixed(2)} km`;
  return `${km.toFixed(1)} km`;
}

export async function calculateAdminCustomerDistance(
origin: { lat: number; lng: number },
destination: { lat: number; lng: number },
customerId: string,
setCustomerDistances: Dispatch<SetStateAction<CustomerDistanceState>>
) {
  console.log('Starting distance calculation:', { origin, destination, customerId });
  
  // Validate coordinates
  if (!origin || !destination) {
    console.error('Invalid origin or destination');
    setCustomerDistances(prev => ({
      ...prev,
      [customerId]: { ...prev[customerId], isCalculating: false }
    }));
    toast.error('Invalid location coordinates');
    return;
  }

  // Validate coordinate ranges
  if (
    !origin.lat || !origin.lng || 
    !destination.lat || !destination.lng ||
    origin.lat === 0 && origin.lng === 0 ||
    destination.lat === 0 && destination.lng === 0 ||
    origin.lat < -90 || origin.lat > 90 ||
    origin.lng < -180 || origin.lng > 180 ||
    destination.lat < -90 || destination.lat > 90 ||
    destination.lng < -180 || destination.lng > 180
  ) {
    console.error('Invalid coordinate values:', { origin, destination });
    setCustomerDistances(prev => ({
      ...prev,
      [customerId]: { ...prev[customerId], isCalculating: false }
    }));
    toast.error('Invalid location coordinates. Please check the customer location.');
    return;
  }
  
  // Set calculating state
  setCustomerDistances(prev => ({
    ...prev,
    [customerId]: { ...prev[customerId], isCalculating: true }
  }));

  try {
    // Ensure Google Maps is loaded
    console.log('Ensuring Google Maps is loaded...');
    await ensureGoogleMapsLoaded();
    console.log('Google Maps loaded');

    // Now safely use DistanceMatrixService
    if (!(window as any).google?.maps?.DistanceMatrixService) {
      throw new Error('DistanceMatrixService not available');
    }

    console.log('Creating DistanceMatrixService...');
    const distanceMatrix = new (window as any).google.maps.DistanceMatrixService();
    
    console.log('Calling getDistanceMatrix...', { 
      origin: { lat: origin.lat, lng: origin.lng }, 
      destination: { lat: destination.lat, lng: destination.lng }
    });
    
    // Set a timeout to prevent getting stuck
    const timeoutId = setTimeout(() => {
      console.error('Distance calculation timeout');
      setCustomerDistances(prev => ({
        ...prev,
        [customerId]: { ...prev[customerId], isCalculating: false }
      }));
      toast.error('Distance calculation timed out. Please try again.');
    }, 15000); // 15 second timeout
    
    // Try DRIVING first (motor bike/scooty), fallback to BICYCLING only if needed
    const tryCalculateDistance = (travelMode: any, modeName: string, isRetry: boolean = false) => {
      const originCoords = { lat: Number(origin.lat), lng: Number(origin.lng) };
      const destCoords = { lat: Number(destination.lat), lng: Number(destination.lng) };
      
      console.log(`Trying ${modeName} mode:`, { origin: originCoords, destination: destCoords });
      
      distanceMatrix.getDistanceMatrix(
        {
          origins: [originCoords],
          destinations: [destCoords],
          travelMode: travelMode,
          unitSystem: (window as any).google.maps.UnitSystem.METRIC,
        },
        (response, status) => {
          console.log(`Distance Matrix callback (${modeName}):`, { status, response });
          
          if (status === (window as any).google.maps.DistanceMatrixStatus.OK && response) {
            const result = response.rows[0].elements[0];
            console.log('Distance Matrix result:', result);
            
            if (result.status === window.google.maps.DistanceMatrixElementStatus.OK) {
              clearTimeout(timeoutId);
              // Convert distance to km if needed
              let distanceText = result.distance.text;
              if (result.distance.value < 1000) {
                distanceText = `${(result.distance.value / 1000).toFixed(2)} km`;
              }

              // If duration is not available, show only distance
              const durationText = result.duration?.text || null;

              console.log('Setting distance:', { distance: distanceText, duration: durationText, mode: modeName });
              setCustomerDistances(prev => ({
                ...prev,
                [customerId]: {
                  distance: distanceText,
                  duration: durationText || '',
                  isCalculating: false,
                  mode: modeName
                }
              }));
            } else if (result.status === window.google.maps.DistanceMatrixElementStatus.ZERO_RESULTS) {
              console.error(`Distance Matrix ZERO_RESULTS with ${modeName} mode:`, { origin: originCoords, destination: destCoords });
              
              // Try fallback: DRIVING -> BICYCLING (motor bike -> bicycle)
              if (travelMode === window.google.maps.TravelMode.DRIVING && !isRetry) {
                console.log('DRIVING returned ZERO_RESULTS, trying BICYCLING mode as fallback...');
                tryCalculateDistance(window.google.maps.TravelMode.BICYCLING, 'BICYCLING', true);
              } else {
                clearTimeout(timeoutId);
                setCustomerDistances(prev => ({
                  ...prev,
                  [customerId]: { ...prev[customerId], isCalculating: false }
                }));
                toast.error('No route found. Please check if the location coordinates are valid.');
              }
            } else {
              clearTimeout(timeoutId);
              console.error('Distance Matrix element status error:', result.status);
              setCustomerDistances(prev => ({
                ...prev,
                [customerId]: { ...prev[customerId], isCalculating: false }
              }));
              toast.error(`Could not calculate distance: ${result.status}`);
            }
          } else {
            clearTimeout(timeoutId);
            console.error('Distance Matrix status error:', status);
            // Mobile-safe fallback: show approximate straight-line distance when Maps route fails (API blocked, quota, referrer, etc.)
            try {
              const approxMeters = haversineDistanceMeters(originCoords, destCoords);
              const approxText = formatDistanceKm(approxMeters);
              if (approxText) {
                setCustomerDistances(prev => ({
                  ...prev,
                  [customerId]: {
                    distance: approxText,
                    duration: '',
                    isCalculating: false,
                  }
                }));
                toast.warning('Showing approximate distance (route unavailable)');
                return;
              }
            } catch {
              // ignore
            }
            setCustomerDistances(prev => ({
              ...prev,
              [customerId]: { ...prev[customerId], isCalculating: false }
            }));
            toast.error(`Distance calculation failed: ${status}`);
          }
        }
      );
    };
    
    // Start with DRIVING mode (motor bike/scooty), fallback to BICYCLING if needed
    tryCalculateDistance(window.google.maps.TravelMode.DRIVING, 'DRIVING', false);
  } catch (error) {
    console.error('Error calculating distance:', error);
    // Mobile-safe fallback: approximate straight-line distance when Maps fails to load/call.
    try {
      const approxMeters = haversineDistanceMeters(origin, destination);
      const approxText = formatDistanceKm(approxMeters);
      if (approxText) {
        setCustomerDistances(prev => ({
          ...prev,
          [customerId]: {
            distance: approxText,
            duration: '',
            isCalculating: false,
          }
        }));
        toast.warning('Showing approximate distance (route unavailable)');
        return;
      }
    } catch {
      // ignore
    }
    setCustomerDistances(prev => ({
      ...prev,
      [customerId]: { ...prev[customerId], isCalculating: false }
    }));
    toast.error(`Failed to calculate distance: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}
