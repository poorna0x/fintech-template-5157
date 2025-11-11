// Utility functions for distance calculations using Google Distance Matrix API

export interface DistanceResult {
  distance: {
    value: number; // in meters
    text: string; // human-readable
  };
  duration: {
    value: number; // in seconds
    text: string; // human-readable
  };
  status: string;
}

export interface TechnicianDistance {
  technicianId: string;
  distance: DistanceResult | null;
  rank?: number;
}

/**
 * Calculate distances from multiple origins to multiple destinations
 * Calls Google Distance Matrix API directly from the browser
 */
export async function calculateDistances(
  origins: Array<{ lat: number; lng: number } | string>,
  destinations: Array<{ lat: number; lng: number } | string>,
  apiKey: string
): Promise<DistanceResult[][] | null> {
  try {
    if (!apiKey) {
      console.error('Google Maps API key is required');
      return null;
    }

    // Use Netlify function to avoid CORS issues
    // Google Distance Matrix API doesn't allow direct browser calls
    const response = await fetch('/.netlify/functions/distance-matrix', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        origins,
        destinations,
        mode: 'driving',
        apiKey,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      let error;
      try {
        error = JSON.parse(errorText);
      } catch {
        error = { message: errorText || `HTTP ${response.status}` };
      }
      console.error('Distance Matrix API error:', error);
      console.error('Full error response:', { status: response.status, statusText: response.statusText, body: errorText });
      
      // If Netlify function is not available, show helpful error
      if (response.status === 404) {
        console.error('⚠️ Netlify function not found. Make sure to run Netlify dev server or deploy to Netlify.');
      } else if (response.status === 500) {
        console.error('⚠️ Server error in distance-matrix function. Check server logs for details.');
        if (error.details) {
          console.error('Error details:', error.details);
        }
        if (error.stack) {
          console.error('Error stack:', error.stack);
        }
      }
      
      return null;
    }

    const data = await response.json();

    if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
      console.error('Distance Matrix API returned error:', data.status, data.error_message);
      return null;
    }

    // Transform the response into a matrix format
    const results: DistanceResult[][] = data.rows.map((row: any) =>
      row.elements.map((element: any) => ({
        distance: element.distance || { value: 0, text: 'N/A' },
        duration: element.duration || { value: 0, text: 'N/A' },
        status: element.status,
      }))
    );

    return results;
  } catch (error) {
    console.error('Error calculating distances:', error);
    return null;
  }
}

/**
 * Calculate distances from job location to multiple technicians
 * Returns technicians sorted by distance
 */
export async function calculateTechnicianDistances(
  jobLocation: { latitude: number; longitude: number },
  technicians: Array<{
    id: string;
    currentLocation?: {
      latitude: number;
      longitude: number;
      lastUpdated?: string;
    };
  }>,
  apiKey: string
): Promise<TechnicianDistance[]> {
  // Filter technicians with valid locations
  // Check both currentLocation and current_location (database field name)
  const techniciansWithLocation = technicians.filter((tech) => {
    const location = tech.currentLocation || (tech as any).current_location;
    return (
      location &&
      location.latitude &&
      location.longitude &&
      location.latitude !== 0 &&
      location.longitude !== 0 &&
      !isNaN(location.latitude) &&
      !isNaN(location.longitude)
    );
  });

  console.log('📍 Technicians location check:', {
    total: technicians.length,
    withLocation: techniciansWithLocation.length,
    withoutLocation: technicians.filter(t => {
      const location = t.currentLocation || (t as any).current_location;
      return !location || !location.latitude || !location.longitude || location.latitude === 0 || location.longitude === 0;
    }).map(t => ({
      id: t.id,
      name: (t as any).fullName || 'Unknown',
      hasCurrentLocation: !!t.currentLocation,
      hasCurrent_location: !!(t as any).current_location,
      currentLocation: t.currentLocation,
      current_location: (t as any).current_location,
      locationType: typeof t.currentLocation,
      locationValue: t.currentLocation
    }))
  });

  if (techniciansWithLocation.length === 0) {
    console.warn('⚠️ No technicians with valid location data found');
    return [];
  }

  // Prepare origins (job location) and destinations (technician locations)
  const origins = [{ lat: jobLocation.latitude, lng: jobLocation.longitude }];
  const destinations = techniciansWithLocation.map((tech) => {
    const location = tech.currentLocation || (tech as any).current_location;
    return {
      lat: location.latitude,
      lng: location.longitude,
    };
  });

  const results = await calculateDistances(origins, destinations, apiKey);

  if (!results || results.length === 0) {
    return [];
  }

  // Map results to technicians
  const technicianDistances: TechnicianDistance[] = techniciansWithLocation.map(
    (tech, index) => {
      const element = results[0]?.[index];
      return {
        technicianId: tech.id,
        distance: element || null,
      };
    }
  );

  // Sort by duration (travel time) and add rank
  // Time is more important than distance in cities like Bengaluru due to traffic
  technicianDistances.sort((a, b) => {
    if (!a.distance || a.distance.status !== 'OK') return 1;
    if (!b.distance || b.distance.status !== 'OK') return -1;
    return a.distance.duration.value - b.distance.duration.value;
  });

  // Add rank
  technicianDistances.forEach((tech, index) => {
    tech.rank = index + 1;
  });

  return technicianDistances;
}

/**
 * Calculate simple Haversine distance (straight-line distance)
 * Used as fallback when API is unavailable
 */
export function calculateHaversineDistance(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371; // Earth's radius in kilometers
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c; // Distance in kilometers
}

