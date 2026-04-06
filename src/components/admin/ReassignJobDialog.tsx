import React, { useState, useEffect, useCallback, useRef } from 'react';
import { calculateHaversineDistance } from '@/lib/distance';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { MapPin, Loader2, Navigation } from 'lucide-react';
import { Job, Technician } from '@/types';
import { customerNameClassName } from '@/lib/customerDisplay';
import { toast } from 'sonner';
import { db } from '@/lib/supabase';
import { getGoogleMapsLinkForJobRow, getJobLatLngFromJobRow } from '@/lib/jobLocationHelpers';

interface ReassignJobDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  job: Job | null;
  technicians: Technician[];
  techniciansRefreshing?: boolean;
  selectedTechnicianId: string;
  onTechnicianSelect: (id: string) => void;
  onReloadTechnicians: () => Promise<void>;
  onSave: () => Promise<void>;
  onCancel: () => void;
}

interface TechnicianWithDistance extends Technician {
  distance?: string;
  duration?: string;
  distanceValue?: number; // in meters for sorting
  isCalculating?: boolean;
}

const ReassignJobDialog: React.FC<ReassignJobDialogProps> = ({
  open,
  onOpenChange,
  job,
  technicians,
  techniciansRefreshing = false,
  selectedTechnicianId,
  onTechnicianSelect,
  onReloadTechnicians,
  onSave,
  onCancel
}) => {
  const [techniciansWithDistances, setTechniciansWithDistances] = useState<TechnicianWithDistance[]>([]);
  const [isCalculatingDistances, setIsCalculatingDistances] = useState(false);
  
  // Cache for distance calculations (key: "lat1,lng1-lat2,lng2", value: { distance, duration })
  const distanceCacheRef = useRef<Map<string, { distance: string; duration: string; distanceValue: number }>>(new Map());

  // Ensure Google Maps is loaded
  const ensureGoogleMapsLoaded = useCallback((): Promise<void> => {
    return new Promise((resolve, reject) => {
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
      const existingScript = document.querySelector(`script[src*="maps.googleapis.com"]`);
      if (existingScript) {
        // Wait for it to load
        existingScript.addEventListener('load', () => {
          setTimeout(() => {
            if ((window as any).google && (window as any).google.maps && (window as any).google.maps.DistanceMatrixService) {
              resolve();
            } else {
              reject(new Error('Google Maps failed to load'));
            }
          }, 1000);
        });
        return;
      }

      const script = document.createElement('script');
      script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places&loading=async`;
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);

      script.onload = () => {
        setTimeout(() => {
          if ((window as any).google && (window as any).google.maps && (window as any).google.maps.DistanceMatrixService) {
            resolve();
          } else {
            reject(new Error('Google Maps failed to load'));
          }
        }, 1000);
      };

      script.onerror = () => {
        reject(new Error('Failed to load Google Maps'));
      };
    });
  }, []);

  // Calculate distances for all technicians
  const calculateDistances = useCallback(async () => {
    if (!job || !open) return;

    let effectiveJob: any = job;
    let jobLocation = getJobLatLngFromJobRow(effectiveJob);
    if (!jobLocation) {
      try {
        const { data, error } = await db.jobs.getByIdFull(job.id);
        if (!error && data) {
          effectiveJob = data;
          jobLocation = getJobLatLngFromJobRow(effectiveJob);
        }
      } catch (e) {
        console.warn('[ReassignJobDialog] getByIdFull for distances failed:', e);
      }
    }

    if (!jobLocation) {
      toast.error('Job location not available. Try again after the address loads.');
      return;
    }

    // Filter technicians with valid locations
    const techniciansWithLocation = technicians.filter((tech) => {
      const location = (tech as any).current_location || tech.currentLocation;
      return (
        location &&
        location.latitude &&
        location.longitude &&
        location.latitude !== 0 &&
        location.longitude !== 0
      );
    });

    if (techniciansWithLocation.length === 0) {
      // No technicians with location, just show all technicians without distances
      setTechniciansWithDistances(technicians.map(t => ({ ...t })));
      return;
    }

    setIsCalculatingDistances(true);

    try {
      // Step 1: Use Haversine formula to calculate straight-line distances and filter to top 10 closest
      const techniciansWithHaversine = techniciansWithLocation.map((tech) => {
        const location = (tech as any).current_location || tech.currentLocation;
        const haversineDistance = calculateHaversineDistance(
          jobLocation.lat,
          jobLocation.lng,
          Number(location.latitude),
          Number(location.longitude)
        );
        return {
          tech,
          haversineDistance, // in kilometers
          location: {
            lat: Number(location.latitude),
            lng: Number(location.longitude),
          }
        };
      });

      // Sort by Haversine distance and take top 10 for Distance Matrix API call
      techniciansWithHaversine.sort((a, b) => a.haversineDistance - b.haversineDistance);
      const topTechnicians = techniciansWithHaversine.slice(0, 10);
      
      // Check cache first
      const destinationsToCalculate: typeof topTechnicians = [];
      const cachedResults: Map<number, { distance: string; duration: string; distanceValue: number }> = new Map();
      
      topTechnicians.forEach((item, index) => {
        const cacheKey = `${jobLocation.lat},${jobLocation.lng}-${item.location.lat},${item.location.lng}`;
        const cached = distanceCacheRef.current.get(cacheKey);
        
        if (cached) {
          cachedResults.set(index, cached);
        } else {
          destinationsToCalculate.push(item);
        }
      });

      // If all results are cached, use cached data
      if (destinationsToCalculate.length === 0) {
        const techniciansWithDist: TechnicianWithDistance[] = topTechnicians.map((item, index) => {
          const cached = cachedResults.get(index);
          if (cached) {
            return {
              ...item.tech,
              distance: cached.distance,
              duration: cached.duration,
              distanceValue: cached.distanceValue,
              isCalculating: false,
            };
          }
          // Fallback to Haversine distance
          return {
            ...item.tech,
            distance: `${item.haversineDistance.toFixed(1)} km (straight-line)`,
            duration: 'N/A',
            distanceValue: item.haversineDistance * 1000, // convert to meters
            isCalculating: false,
          };
        });

        // Add remaining technicians (beyond top 10) with Haversine distances
        const remainingTechnicians = techniciansWithHaversine.slice(10).map((item) => ({
          ...item.tech,
          distance: `${item.haversineDistance.toFixed(1)} km (straight-line)`,
          duration: 'N/A',
          distanceValue: item.haversineDistance * 1000,
          isCalculating: false,
        }));

        // Add technicians without location
        const techniciansWithoutLocation = technicians
          .filter(t => {
            const location = (t as any).current_location || t.currentLocation;
            return !location || !location.latitude || !location.longitude || 
                   location.latitude === 0 || location.longitude === 0;
          })
          .map(t => ({ ...t, distance: 'N/A', duration: 'N/A', distanceValue: Infinity }));

        const allTechnicians = [...techniciansWithDist, ...remainingTechnicians, ...techniciansWithoutLocation];
        allTechnicians.sort((a, b) => {
          if (a.distanceValue !== undefined && b.distanceValue !== undefined) {
            return a.distanceValue - b.distanceValue;
          }
          if (a.distanceValue !== undefined) return -1;
          if (b.distanceValue !== undefined) return 1;
          return (a.fullName || '').localeCompare(b.fullName || '');
        });
        setTechniciansWithDistances(allTechnicians);
        setIsCalculatingDistances(false);
        return;
      }

      // Step 2: Call Distance Matrix API only for technicians not in cache
      await ensureGoogleMapsLoaded();

      if (!(window as any).google?.maps?.DistanceMatrixService) {
        throw new Error('DistanceMatrixService not available');
      }

      const distanceMatrix = new (window as any).google.maps.DistanceMatrixService();
      const destinations = destinationsToCalculate.map(item => item.location);

      // Calculate distances using Distance Matrix API
      distanceMatrix.getDistanceMatrix(
        {
          origins: [{ lat: jobLocation.lat, lng: jobLocation.lng }],
          destinations: destinations,
          travelMode: (window as any).google.maps.TravelMode.DRIVING,
          unitSystem: (window as any).google.maps.UnitSystem.METRIC,
        },
        (response: any, status: any) => {
          if (status === (window as any).google.maps.DistanceMatrixStatus.OK && response) {
            // Process API results and update cache
            const apiResults: TechnicianWithDistance[] = destinationsToCalculate.map((item, apiIndex) => {
              const element = response.rows[0]?.elements[apiIndex];
              if (element?.status === (window as any).google.maps.DistanceMatrixElementStatus.OK) {
                const distance = element.distance?.text || 'N/A';
                const duration = element.duration?.text || 'N/A';
                const distanceValue = element.distance?.value || Infinity;
                
                // Cache the result
                const cacheKey = `${jobLocation.lat},${jobLocation.lng}-${item.location.lat},${item.location.lng}`;
                distanceCacheRef.current.set(cacheKey, { distance, duration, distanceValue });
                
                return {
                  ...item.tech,
                  distance,
                  duration,
                  distanceValue,
                  isCalculating: false,
                };
              } else {
                // Fallback to Haversine if API fails
                return {
                  ...item.tech,
                  distance: `${item.haversineDistance.toFixed(1)} km (straight-line)`,
                  duration: 'N/A',
                  distanceValue: item.haversineDistance * 1000,
                  isCalculating: false,
                };
              }
            });

            // Combine cached results with API results
            const allTopTechnicians: TechnicianWithDistance[] = topTechnicians.map((item, index) => {
              const cached = cachedResults.get(index);
              if (cached) {
                return {
                  ...item.tech,
                  distance: cached.distance,
                  duration: cached.duration,
                  distanceValue: cached.distanceValue,
                  isCalculating: false,
                };
              }
              // Find in API results
              const apiResult = apiResults.find(r => r.id === item.tech.id);
              if (apiResult) {
                return apiResult;
              }
              // Fallback to Haversine
              return {
                ...item.tech,
                distance: `${item.haversineDistance.toFixed(1)} km (straight-line)`,
                duration: 'N/A',
                distanceValue: item.haversineDistance * 1000,
                isCalculating: false,
              };
            });

            // Add remaining technicians (beyond top 10) with Haversine distances
            const remainingTechnicians = techniciansWithHaversine.slice(10).map((item) => ({
              ...item.tech,
              distance: `${item.haversineDistance.toFixed(1)} km (straight-line)`,
              duration: 'N/A',
              distanceValue: item.haversineDistance * 1000,
              isCalculating: false,
            }));

            const techniciansWithDist: TechnicianWithDistance[] = [...allTopTechnicians];

            // Add technicians without location
            const techniciansWithoutLocation = technicians
              .filter(t => {
                const location = (t as any).current_location || t.currentLocation;
                return !location || !location.latitude || !location.longitude || 
                       location.latitude === 0 || location.longitude === 0;
              })
              .map(t => ({ ...t, distance: 'N/A', duration: 'N/A', distanceValue: Infinity }));

            // Combine and sort by distance
            const allTechnicians = [...techniciansWithDist, ...remainingTechnicians, ...techniciansWithoutLocation];
            allTechnicians.sort((a, b) => {
              // Sort by distance value (meters), then by name
              if (a.distanceValue !== undefined && b.distanceValue !== undefined) {
                return a.distanceValue - b.distanceValue;
              }
              if (a.distanceValue !== undefined) return -1;
              if (b.distanceValue !== undefined) return 1;
              return (a.fullName || '').localeCompare(b.fullName || '');
            });

            setTechniciansWithDistances(allTechnicians);
          } else {
            // Error calculating distances, fallback to Haversine distances
            const techniciansWithHaversine: TechnicianWithDistance[] = techniciansWithLocation.map((tech) => {
              const location = (tech as any).current_location || tech.currentLocation;
              const haversineDistance = calculateHaversineDistance(
                jobLocation.lat,
                jobLocation.lng,
                Number(location.latitude),
                Number(location.longitude)
              );
              return {
                ...tech,
                distance: `${haversineDistance.toFixed(1)} km (straight-line)`,
                duration: 'N/A',
                distanceValue: haversineDistance * 1000,
                isCalculating: false,
              };
            });

            const techniciansWithoutLocation = technicians
              .filter(t => {
                const location = (t as any).current_location || t.currentLocation;
                return !location || !location.latitude || !location.longitude || 
                       location.latitude === 0 || location.longitude === 0;
              })
              .map(t => ({ ...t, distance: 'N/A', duration: 'N/A', distanceValue: Infinity }));

            const allTechnicians = [...techniciansWithHaversine, ...techniciansWithoutLocation];
            allTechnicians.sort((a, b) => {
              if (a.distanceValue !== undefined && b.distanceValue !== undefined) {
                return a.distanceValue - b.distanceValue;
              }
              if (a.distanceValue !== undefined) return -1;
              if (b.distanceValue !== undefined) return 1;
              return (a.fullName || '').localeCompare(b.fullName || '');
            });

            setTechniciansWithDistances(allTechnicians);
            console.error('Distance Matrix API failed, using Haversine distances:', status);
          }
          setIsCalculatingDistances(false);
        }
      );
    } catch (error) {
      console.error('Error calculating distances:', error);
      setTechniciansWithDistances(technicians.map(t => ({ ...t })));
      setIsCalculatingDistances(false);
    }
  }, [job, technicians, open, ensureGoogleMapsLoaded]);

  // Reset distances when dialog opens/closes (don't auto-calculate)
  useEffect(() => {
    if (!open) {
      setTechniciansWithDistances([]);
      setIsCalculatingDistances(false);
    }
    // Don't auto-calculate distances - only calculate when user clicks "Reassign by Distance" button
  }, [open]);

  const jobLocation = job ? getJobLatLngFromJobRow(job) : null;

  const inactiveTechnicians = (techniciansWithDistances.length > 0 ? techniciansWithDistances : technicians).filter(
    (tech) => tech.account_status !== 'INACTIVE'
  );
  const technicianPickerBlocked = techniciansRefreshing && inactiveTechnicians.length === 0;

  const handleLazyOpenGoogleMaps = async () => {
    if (!job?.id) return;
    const t = toast.loading('Loading location…');
    try {
      const { data, error } = await db.jobs.getByIdFull(job.id);
      toast.dismiss(t);
      if (error || !data) {
        toast.error('Could not load location');
        return;
      }
      const link = getGoogleMapsLinkForJobRow(data);
      if (link) window.open(link, '_blank', 'noopener,noreferrer');
      else toast.error('No map link for this job');
    } catch {
      toast.dismiss(t);
      toast.error('Could not load location');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] sm:w-[90vw] md:w-[600px] max-w-[600px] max-h-[90vh] flex flex-col duration-100 ease-out data-[state=open]:zoom-in-100 data-[state=closed]:zoom-out-100 data-[state=open]:slide-in-from-left-0 data-[state=open]:slide-in-from-top-0 data-[state=closed]:slide-out-to-left-0 data-[state=closed]:slide-out-to-top-0">
        <DialogHeader>
          <DialogTitle className="text-lg sm:text-xl">Reassign Job to Technician</DialogTitle>
          <DialogDescription className="text-sm">
            Choose how to reassign this job
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4 sm:space-y-6 overflow-y-auto flex-1 pr-1 sm:pr-2">
          {/* Job Details */}
          {job && (
            <div className="bg-gray-50 rounded-lg p-3 sm:p-4">
              <div className="flex flex-col sm:flex-row sm:items-center gap-2 mb-2">
                <span className="font-mono font-bold text-base sm:text-lg">{(job as any)?.job_number}</span>
                <Badge className="bg-blue-100 text-blue-800 text-xs sm:text-sm w-fit">
                  {(job as any)?.service_type} - {(job as any)?.service_sub_type}
                </Badge>
              </div>
              <div className="space-y-1 text-xs sm:text-sm text-gray-600">
                <p>
                  <strong>Customer:</strong>{' '}
                  <span className={customerNameClassName((job as any)?.customer)}>
                    {(job as any)?.customer?.full_name || (job as any)?.customer?.fullName || 'N/A'}
                  </span>
                </p>
                <p><strong>Scheduled:</strong> {(job as any)?.scheduled_date} - {(job as any)?.scheduled_time_slot}</p>
                {(() => {
                  const serviceAddress = (job as any)?.service_address || {};
                  const customer = (job as any)?.customer || {};
                  const customerAddress = customer?.address || (customer as any)?.address || {};
                  
                  // Try multiple possible locations for visible_address (prioritize this)
                  let visibleLocation = 
                    serviceAddress?.visible_address || 
                    (serviceAddress as any)?.visibleAddress ||
                    customerAddress?.visible_address || 
                    (customerAddress as any)?.visibleAddress ||
                    (customer as any)?.visible_address ||
                    '';
                  
                  // If visible_location contains a full address (has commas), extract just the first part (area name)
                  if (visibleLocation && visibleLocation.includes(',')) {
                    visibleLocation = visibleLocation.split(',')[0].trim();
                  }
                  
                  // If no visible_address or it's invalid, try using the area field as fallback
                  if (!visibleLocation || visibleLocation.trim().length === 0) {
                    visibleLocation = serviceAddress?.area || customerAddress?.area || '';
                    // If area also contains commas, extract first part
                    if (visibleLocation && visibleLocation.includes(',')) {
                      visibleLocation = visibleLocation.split(',')[0].trim();
                    }
                  }
                  
                  // Filter out common city/state/country names
                  const lowerLocation = visibleLocation?.toLowerCase() || '';
                  const isCityOrState = 
                    lowerLocation === 'bengaluru' || 
                    lowerLocation === 'bangalore' ||
                    lowerLocation === 'karnataka' ||
                    lowerLocation === 'india' ||
                    lowerLocation.includes('bengaluru') && lowerLocation.length < 15; // If it's just "Bengaluru" or very short with bengaluru
                  
                  // Only show if we have a valid visible location (not empty and not a full address)
                  const isValidVisibleLocation = visibleLocation && 
                    visibleLocation.trim().length > 0 && 
                    visibleLocation.length < 50 && // Visible location should be short (one word/area name)
                    !isCityOrState && // Should not be just city/state name
                    !visibleLocation.includes('India') && // Should not contain country name
                    !lowerLocation.includes('karnataka'); // Should not contain state name
                  
                  return isValidVisibleLocation ? (
                    <p className="text-xs sm:text-sm text-gray-600"><strong>Location:</strong> {visibleLocation}</p>
                  ) : (
                    <p className="truncate"><strong>Location:</strong> {(job as any)?.service_address?.street || 'N/A'}</p>
                  );
                })()}
              </div>
              {(() => {
                const googleMapsLink = getGoogleMapsLinkForJobRow(job);
                return googleMapsLink ? (
                  <a 
                    href={googleMapsLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-lg transition-colors mt-2 w-full sm:w-auto justify-center sm:justify-start"
                  >
                    <MapPin className="w-4 h-4" />
                    Open in Google Maps
                  </a>
                ) : (
                  <Button
                    type="button"
                    onClick={() => void handleLazyOpenGoogleMaps()}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-lg transition-colors mt-2 w-full sm:w-auto justify-center sm:justify-start"
                  >
                    <MapPin className="w-4 h-4" />
                    Open in Google Maps
                  </Button>
                );
              })()}
            </div>
          )}

          {/* Technician Selection */}
          <div className="space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div className="flex flex-col gap-1">
                <Label htmlFor="technician-select" className="text-sm sm:text-base">Select Technician</Label>
                {techniciansRefreshing && inactiveTechnicians.length > 0 && (
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <Loader2 className="h-3 w-3 animate-spin shrink-0" />
                    Updating technician list…
                  </span>
                )}
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={calculateDistances}
                disabled={technicianPickerBlocked || isCalculatingDistances}
                className="text-xs w-full sm:w-auto"
                title="Calculate distances from job location (loads full address if needed)"
              >
                {isCalculatingDistances ? (
                  <>
                    <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                    Calculating...
                  </>
                ) : (
                  <>
                    <Navigation className="w-3 h-3 mr-1" />
                    Reassign by Distance
                  </>
                )}
              </Button>
            </div>
            <Select
              value={selectedTechnicianId}
              onValueChange={onTechnicianSelect}
              disabled={technicianPickerBlocked}
            >
              <SelectTrigger className="w-full border border-gray-300 focus:border-blue-500 focus:ring-0 focus:ring-offset-0">
                <SelectValue
                  placeholder={technicianPickerBlocked ? 'Loading technicians…' : 'Choose a technician'}
                />
              </SelectTrigger>
              <SelectContent className="max-h-[300px] overflow-y-auto">
                {technicianPickerBlocked ? (
                  <SelectItem value="__loading__" disabled>
                    Loading technicians…
                  </SelectItem>
                ) : inactiveTechnicians.length === 0 ? (
                  <SelectItem value="no-technicians" disabled>
                    No technicians available
                  </SelectItem>
                ) : (
                  inactiveTechnicians.map((technician) => {
                    const techWithDist = technician as TechnicianWithDistance;
                    return (
                      <SelectItem key={technician.id} value={technician.id || 'unknown'}>
                        <div className="flex items-center justify-between w-full gap-2">
                          <span className="truncate flex-1 min-w-0">{technician.fullName || 'Unknown Technician'}</span>
                          {techWithDist.distance && techWithDist.distance !== 'N/A' && (
                            <div className="flex items-center gap-1 text-xs text-current opacity-70 shrink-0">
                              <Navigation className="w-3 h-3" />
                              <span>{techWithDist.distance}</span>
                              {techWithDist.duration && techWithDist.duration !== 'N/A' && (
                                <span className="opacity-100">• {techWithDist.duration}</span>
                              )}
                            </div>
                          )}
                        </div>
                      </SelectItem>
                    );
                  })
                )}
              </SelectContent>
            </Select>
            {techniciansWithDistances.length > 0 && (
              <div className="text-xs text-gray-500 mt-1">
                Technicians sorted by distance from job location
              </div>
            )}
          </div>
        </div>
        
        <DialogFooter className="mt-4 flex-shrink-0 flex-col sm:flex-row gap-2">
          <Button
            variant="outline"
            onClick={onCancel}
            className="w-full sm:w-auto"
          >
            Cancel
          </Button>
          <Button
            onClick={onSave}
            disabled={technicianPickerBlocked || !selectedTechnicianId}
            className="bg-blue-600 hover:bg-blue-700 w-full sm:w-auto"
          >
            Reassign Job
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ReassignJobDialog;

